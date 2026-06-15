import { InstanceRuntime } from "../project/instance-runtime"
import { context } from "../project/instance-context"

export async function bootstrap<T>(directory: string, cb: () => Promise<T>) {
  const ctx = await InstanceRuntime.load({ directory })

  // Ensure CEO lease cleanup on signal-based exit (window close, Ctrl+C)
  let disposed = false
  const disposeAndExit = async () => {
    if (disposed) return
    disposed = true
    await InstanceRuntime.disposeInstance(ctx).catch(() => {})
    process.exit()
  }
  process.once("SIGHUP", disposeAndExit)
  process.once("SIGTERM", disposeAndExit)
  process.once("SIGINT", disposeAndExit)

  try {
    return await context.provide(ctx, cb)
  } finally {
    disposed = true
    process.off("SIGHUP", disposeAndExit)
    process.off("SIGTERM", disposeAndExit)
    process.off("SIGINT", disposeAndExit)
    await InstanceRuntime.disposeInstance(ctx)
  }
}
