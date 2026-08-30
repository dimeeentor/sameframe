export const PORT = 8000
export const PUBLIC =
  Deno.args.includes("--public") || Deno.args.includes("--share")
