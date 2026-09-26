/** One transient status line at a time, HUD-style. A new message replaces
 *  the current one rather than queueing behind it. */

export const toast = $state({ message: "", icon: "check" as "check" | "x", seq: 0 })

let timer: ReturnType<typeof setTimeout> | undefined

export function showToast(message: string, icon: "check" | "x" = "check") {
  toast.message = message
  toast.icon = icon
  toast.seq++
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => (toast.message = ""), 1800)
}
