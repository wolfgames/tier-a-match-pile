/// <reference types="vite/client" />

declare module "qrcode-terminal" {
  export function generate(url: string, options?: { small?: boolean }): void;
}
