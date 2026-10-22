// __MOD__: __DESCRIPTION__
//   A starting point: a band above the prompt that counts this session's tool calls.
import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

// Held by the host, so a hot reload keeps it.
const count = atom({ plugin: '__MOD__', key: 'count' } as const, 0)

export const register: Register = on => {
  on('tool.call', async ($, e, next) => {
    await update($, count, n => n + 1)
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const n = await read($, count)
    if (n === 0) return next(e)
    const { Text } = $.ui.resolve(e)
    return <Text dimColor>__MOD__: {n} tool calls</Text>
  })
}
