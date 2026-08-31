export let publicUrl: string | null = null

export function setPublicUrl(url: string) {
  publicUrl = url.replace(/\/$/, "")
  console.log(
    `\n✨ PUBLIC URL: ${publicUrl}  → share with anyone!\n   (Share button will now copy this)\n`,
  )
}
