import "server-only";
import type {
  ClientPlatform,
  PushPermissionState,
  PushTokenProvider,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logAppEvent } from "@/services/events/log-event";

export type RegisterInstallationInput = {
  installationId: string;
  platform: ClientPlatform;
  userId?: string | null;
  dealerId?: string | null;
  appVersion?: string | null;
  buildNumber?: string | null;
  pushToken?: string | null;
  pushProvider?: PushTokenProvider | null;
  pushPermission?: PushPermissionState | null;
};

export async function registerOrUpdateInstallation(
  input: RegisterInstallationInput
) {
  const existing = await prisma.deviceInstallation.findUnique({
    where: { installationId: input.installationId },
  });

  const data = {
    platform: input.platform,
    userId: input.userId ?? undefined,
    dealerId: input.dealerId ?? undefined,
    appVersion: input.appVersion ?? undefined,
    buildNumber: input.buildNumber ?? undefined,
    pushToken: input.pushToken ?? undefined,
    pushProvider: input.pushProvider ?? undefined,
    pushPermission: input.pushPermission ?? undefined,
    lastSeenAt: new Date(),
    revokedAt: null,
  };

  const row = existing
    ? await prisma.deviceInstallation.update({
        where: { installationId: input.installationId },
        data,
      })
    : await prisma.deviceInstallation.create({
        data: {
          installationId: input.installationId,
          platform: input.platform,
          userId: input.userId ?? null,
          dealerId: input.dealerId ?? null,
          appVersion: input.appVersion ?? null,
          buildNumber: input.buildNumber ?? null,
          pushToken: input.pushToken ?? null,
          pushProvider: input.pushProvider ?? null,
          pushPermission: input.pushPermission ?? "UNKNOWN",
        },
      });

  await logAppEvent({
    eventType: "DEVICE_REGISTERED",
    entityType: "DeviceInstallation",
    entityId: row.id,
    userId: input.userId ?? undefined,
    dealerId: input.dealerId ?? undefined,
    metadata: {
      installationId: input.installationId,
      platform: input.platform,
      rotated: Boolean(existing),
    },
  });

  return row;
}

export async function revokeInstallation(params: {
  installationId?: string;
  userId?: string;
  pushToken?: string;
}) {
  if (params.installationId) {
    const row = await prisma.deviceInstallation.updateMany({
      where: { installationId: params.installationId, revokedAt: null },
      data: { revokedAt: new Date(), pushToken: null },
    });
    return { revoked: row.count };
  }

  if (params.pushToken && params.userId) {
    const row = await prisma.deviceInstallation.updateMany({
      where: {
        userId: params.userId,
        pushToken: params.pushToken,
        revokedAt: null,
      },
      data: { revokedAt: new Date(), pushToken: null },
    });
    return { revoked: row.count };
  }

  if (params.userId) {
    const row = await prisma.deviceInstallation.updateMany({
      where: { userId: params.userId, revokedAt: null },
      data: { revokedAt: new Date(), pushToken: null },
    });
    return { revoked: row.count };
  }

  return { revoked: 0 };
}
