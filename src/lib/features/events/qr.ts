import QRCode from 'qrcode';

export async function generateQrSvg(url: string, color = '#000000'): Promise<string> {
  return QRCode.toString(url, {
    type: 'svg',
    margin: 2,
    color: {
      dark: color,
      light: '#ffffff'
    }
  });
}