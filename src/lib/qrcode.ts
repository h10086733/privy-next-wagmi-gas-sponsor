type QrCodeModule = {
  toDataURL: (
    text: string,
    options?: {
      errorCorrectionLevel?: "L" | "M" | "Q" | "H";
      margin?: number;
      width?: number;
      color?: {
        dark?: string;
        light?: string;
      };
    },
  ) => Promise<string>;
};

async function loadQrCodeModule(): Promise<QrCodeModule> {
  const qrCodeModule = (await import(
    "../../node_modules/.pnpm/node_modules/qrcode"
  )) as QrCodeModule & { default?: QrCodeModule };

  return qrCodeModule.toDataURL ? qrCodeModule : qrCodeModule.default!;
}

export async function generateQrCodeDataUrl(text: string): Promise<string> {
  const qrCodeModule = await loadQrCodeModule();

  return qrCodeModule.toDataURL(text, {
    errorCorrectionLevel: "M",
    margin: 1,
    width: 240,
    color: {
      dark: "#111827",
      light: "#FFFFFFFF",
    },
  });
}
