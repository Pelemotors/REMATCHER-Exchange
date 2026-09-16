import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { cropIsraeliYellowPlate } from "@/services/intake/israeli-plate-crop";

describe("cropIsraeliYellowPlate", () => {
  it("zooms onto a yellow plate-like rectangle", async () => {
    const img = await sharp({
      create: {
        width: 800,
        height: 400,
        channels: 3,
        background: { r: 40, g: 40, b: 40 },
      },
    })
      .composite([
        {
          input: await sharp({
            create: {
              width: 160,
              height: 40,
              channels: 3,
              background: { r: 230, g: 190, b: 40 },
            },
          })
            .png()
            .toBuffer(),
          left: 80,
          top: 180,
        },
      ])
      .jpeg()
      .toBuffer();

    const crop = await cropIsraeliYellowPlate(img);
    expect(crop).not.toBeNull();
    expect(crop!.box.width).toBeGreaterThan(120);
    expect(crop!.box.width).toBeLessThan(250);
    expect(crop!.box.left).toBeGreaterThan(40);
    expect(crop!.box.left).toBeLessThan(120);
  });

  it("returns null when there is no yellow plate region", async () => {
    const img = await sharp({
      create: {
        width: 200,
        height: 200,
        channels: 3,
        background: { r: 30, g: 30, b: 40 },
      },
    })
      .jpeg()
      .toBuffer();
    expect(await cropIsraeliYellowPlate(img)).toBeNull();
  });
});
