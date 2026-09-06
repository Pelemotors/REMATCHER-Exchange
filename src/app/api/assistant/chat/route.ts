import { NextResponse } from "next/server";
import { requireVerifiedDealer } from "@/lib/auth-guards";
import { runExchangeAssistantV2 } from "@/services/assistant/v2-orchestrator";
import { logAppEvent } from "@/services/notifications";
import type { ConversationState } from "@/services/assistant/conversation-state";
import { prisma } from "@/lib/prisma";
import { toPrismaJson } from "@/lib/prisma-json";
import { confirmImport } from "@/services/inventory/import";
import { isConfirmation, isRejection } from "@/services/assistant/conversation-state";

const CONVERSATION_TOPIC = "agent_conversation_state_v1";

async function loadConversation(dealerId:string):Promise<ConversationState|undefined>{
  const row=await prisma.dealerMemoryItem.findFirst({where:{dealerId,topicKey:CONVERSATION_TOPIC,status:"ACTIVE"},orderBy:{updatedAt:"desc"}});
  const details=row?.details as {state?:ConversationState}|null;
  return details?.state;
}
async function saveConversation(dealerId:string,state:ConversationState|undefined){
  if(!state)return;
  const existing=await prisma.dealerMemoryItem.findFirst({where:{dealerId,topicKey:CONVERSATION_TOPIC,status:"ACTIVE"},orderBy:{updatedAt:"desc"}});
  const data={summary:"Operational personal-agent conversation state",details:toPrismaJson({state}),kind:"TEMPORARY" as const,provenance:"SYSTEM_DERIVED" as const,confidence:1};
  if(existing) await prisma.dealerMemoryItem.update({where:{id:existing.id},data});
  else await prisma.dealerMemoryItem.create({data:{dealerId,topicKey:CONVERSATION_TOPIC,status:"ACTIVE",...data}});
}

export async function GET(){
  const authResult=await requireVerifiedDealer();
  if("error" in authResult)return NextResponse.json({error:authResult.error},{status:authResult.status});
  const state=await loadConversation(authResult.session.user.dealerId!);
  return NextResponse.json({conversation:state??{},recentTurns:state?.recentTurns??[]});
}

export async function POST(req:Request){
  const authResult=await requireVerifiedDealer();
  if("error" in authResult)return NextResponse.json({error:authResult.error},{status:authResult.status});
  const dealerId=authResult.session.user.dealerId!;
  const {message,context,conversation}=await req.json() as {message?:string;context?:{route:string;entityType?:string;entityId?:string;entityLabel?:string;surface?:string;mode?:"inventory_management";vehicleId?:string;demandId?:string;matchId?:string};conversation?:ConversationState};
  if(!message?.trim())return NextResponse.json({error:"Message required"},{status:400});
  const persisted=await loadConversation(dealerId);
  const incomingHasState=conversation&&Object.keys(conversation).length>0;
  const activeConversation:ConversationState|undefined=incomingHasState?conversation:persisted;

  await logAppEvent({eventType:"assistant_opened",dealerId,metadata:{userId:authResult.session.user.id}});

  // Inventory files are drafts until the dealer approves them through the personal agent.
  if(/בדוק את קובץ המלאי שהעליתי|בדיקת קובץ מלאי/i.test(message.trim())){
    const job=await prisma.inventoryImport.findFirst({where:{dealerId,status:"PREVIEW"},orderBy:{createdAt:"desc"}});
    if(!job)return NextResponse.json({intent:"UPDATE_INVENTORY",message:"לא מצאתי קובץ מלאי שממתין לבדיקה.",conversation:activeConversation??{},agentVersion:"2.4"});
    const p=job.previewJson as unknown as {rows?:Array<{valid?:boolean;warnings?:string[];duplicateOfVehicleId?:string|null}>;diff?:{newCount?:number;stillActiveCount?:number;missingFromFile?:unknown[]}};
    const rows=p.rows??[]; const valid=rows.filter(r=>r.valid).length; const attention=rows.filter(r=>(r.warnings?.length??0)>0).length; const duplicates=rows.filter(r=>r.duplicateOfVehicleId).length;
    const next:ConversationState={...(activeConversation??{}),pendingConfirmation:{action:"confirm_inventory_import",label:"אשר קליטת מלאי",payload:{importId:job.id,markMissingAsSold:false}},goal:"inventory_import_review"};
    next.recentTurns=[...(next.recentTurns??[]),{role:"user",text:"בדיקת קובץ מלאי"},{role:"assistant",text:`קלטתי ${rows.length} שורות: ${valid} תקינות, ${attention} דורשות תשומת לב${duplicates?`, ${duplicates} מזוהות כעדכון קיים`:""}. רק שורות תקינות ייקלטו. לא אסמן רכבים חסרים כנמכרו. לאשר את הקליטה?`}].slice(-12);
    await saveConversation(dealerId,next);
    return NextResponse.json({intent:"UPDATE_INVENTORY",message:`קלטתי ${rows.length} שורות: ${valid} תקינות, ${attention} דורשות תשומת לב${duplicates?`, ${duplicates} מזוהות כעדכון קיים`:""}. רק שורות תקינות ייקלטו. לא אסמן רכבים חסרים כנמכרו. לאשר את הקליטה?`,requiresConfirmation:next.pendingConfirmation,conversation:next,agentVersion:"2.4"});
  }

  if(activeConversation?.pendingConfirmation?.action==="confirm_inventory_import"){
    if(isRejection(message)){const next={...activeConversation,pendingConfirmation:undefined,goal:undefined};await saveConversation(dealerId,next);return NextResponse.json({intent:"UPDATE_INVENTORY",message:"ביטלתי. הקובץ נשאר כטיוטה ולא שינה את המלאי.",conversation:next,agentVersion:"2.4"});}
    if(isConfirmation(message)){
      const importId=String(activeConversation.pendingConfirmation.payload.importId??"");
      const result=await confirmImport({dealerId,importId,markMissingAsSold:false});
      const next:ConversationState={...activeConversation,pendingConfirmation:undefined,goal:undefined,recentTurns:[...(activeConversation.recentTurns??[]),{role:"user",text:message},{role:"assistant",text:`המלאי נקלט: ${result.created} חדשים, ${result.updated} עודכנו.`}].slice(-12)};
      await saveConversation(dealerId,next);
      return NextResponse.json({intent:"UPDATE_INVENTORY",message:`בוצע. ${result.created} רכבים חדשים נקלטו ו-${result.updated} עודכנו. המלאי כבר זמין ל-matching ולסוכן האישי.`,conversation:next,agentVersion:"2.4"});
    }
  }

  const response=await runExchangeAssistantV2({dealerId,userId:authResult.session.user.id,message:message.trim(),context:context??{route:"/"},conversation:activeConversation});
  await saveConversation(dealerId,response.conversation);
  return NextResponse.json({...response,agentVersion:response.meta?.agentVersion??"2.4"});
}
