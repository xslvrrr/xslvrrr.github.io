export {}

const commands: string[][] = [
  ['bun', 'run', 'dev:desktop:server'],
  ['bun', 'run', 'dev:desktop:ui'],
]

const processes = commands.map((command) => ({
  command,
  child: Bun.spawn(command, {
    cwd: process.cwd(),
    stdin: 'inherit',
    stdout: 'inherit',
    stderr: 'inherit',
  }),
}))

let isStopping = false

async function stopChildren(exitCode: number): Promise<never> {
  if (!isStopping) {
    isStopping = true
    processes.forEach(({ child }) => {
      if (!child.killed) child.kill()
    })
    await Promise.allSettled(processes.map(({ child }) => child.exited))
  }

  process.exit(exitCode)
}

process.once('SIGINT', () => {
  void stopChildren(130)
})
process.once('SIGTERM', () => {
  void stopChildren(143)
})

const firstExit = await Promise.race(
  processes.map(async ({ child, command }) => ({
    code: await child.exited,
    command: command.join(' '),
  }))
)

if (!isStopping && firstExit.code !== 0) {
  process.stderr.write(`${firstExit.command} exited with code ${firstExit.code}\n`)
}

await stopChildren(firstExit.code)
