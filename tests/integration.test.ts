import { createServer, IncomingMessage, ServerResponse } from "http";
import { clearAllWants, withAsyncLocalWantedStorage, WANT_FROM } from "../src/storage.ts";
import { want, Wantable, WantableAsync, wantAsync } from "../src/want.ts";
import { after, beforeEach, describe, it } from "node:test";
import assert from "assert";

const server = await newServer()

describe('server test', () => {
  beforeEach(clearAllWants)
  after(server.close)

  it('should send have unique session id', async () => {
    const getHealthSessionId = async () => {
      const res = await fetch(`${server.address}/api/v1/health`)
      return res.headers.get('x-logger-session')
    }
    const firstSessionId = await getHealthSessionId()
    const secondSessionId = await getHealthSessionId()
    assert.ok(firstSessionId !== null)
    assert.ok(secondSessionId !== null)
    assert.notEqual(firstSessionId, secondSessionId)
  })

  it('should use same logger instance', async () => {
    const getServerLoggerId = async () => {
      const res = await fetch(`${server.address}/api/v1/health`)
      return res.headers.get('x-loggerheader')
    }
    const firstLoggerId = await getServerLoggerId()
    const secondLoggerId = await getServerLoggerId()
    assert.ok(firstLoggerId !== null)
    assert.ok(secondLoggerId !== null)
    assert.equal(firstLoggerId, secondLoggerId)

  })

  it('should be able to fetch data', async () => {
    const allDataRes = await fetch(`${server.address}/api/v1/data`)
    const allData = await allDataRes.json()
    const databaseProvider = await wantAsync(DatabaseProvider)
    assert.deepEqual(allData, databaseProvider.data)
  })
})

// server configuration
class ParentHeaderLogger {
  readonly id: string
  constructor() {
    this.id = crypto.randomUUID().split('-')[0]
  }
  logInstanceToResponse(res: ServerResponse) {
    res.setHeader(`x-${this.constructor.name}`, this.id)
  }
}
class LoggerHeader extends Wantable(ParentHeaderLogger) {
  want() { }

  logHeader(res: ServerResponse, key: string, message: string) {
    res.setHeader(`x-logger-${key}`, message)
  }
}

class SessionIdProvider extends Wantable(ParentHeaderLogger) {
  session!: string
  logger!: LoggerHeader
  want() {
    this.session = crypto.randomUUID().split('-')[0]
    this.logger = want(LoggerHeader)
  }
  logSessionId(res: ServerResponse) {
    this.logger.logHeader(res, 'session', this.session)
  }
}

class DatabaseProvider extends WantableAsync(ParentHeaderLogger) {
  readonly data = [
    { id: 0, data: "hello" },
    { id: 1, data: "world" },
    { id: 2, data: "ni hao" },
    { id: 3, data: "shi jie" },
  ]
  connected = false
  async wantAsync() {
    this.connected = true
    return
  }
  getById(id: number) {
    return this.data.find(e => e.id === id)
  }
}



function newServer() {
  const { resolve, reject, promise } = Promise.withResolvers<{ close: () => Promise<void>, address: string }>()
  const handlers = {
    '/api/v1/health': (req, res) => {
      if (req.method !== 'GET') {
        res.writeHead(404, 'Not Found')
        res.end()
        return
      }
      const sessionIdProvider = want(SessionIdProvider, WANT_FROM.ASYNC_LOCAL)
      sessionIdProvider.logSessionId(res)
      sessionIdProvider.logInstanceToResponse(res)

      const loggerProvider = want(LoggerHeader)
      loggerProvider.logInstanceToResponse(res)
      res.setHeader('content-type', 'application/json')
      res.end(JSON.stringify({ status: 'ok' }))
    },
    '/api/v1/data': async (req, res) => {
      const database = await wantAsync(DatabaseProvider)
      database.logInstanceToResponse(res)

      if (req.method === 'GET') {
        res.setHeader('content-type', 'application/json')
        res.end(JSON.stringify(database.data))
        return
      }

      if (req.method === 'POST') {
        let dataString = ''
        for await (const chunk of req.iterator()) {
          dataString += String(chunk)
        }
        const data = JSON.parse(dataString)
        if (!data.id) {
          res.writeHead(404, 'Not Found')
          res.end()
          return
        }
        const datum = database.getById(data.id)
        if (!datum) {
          res.writeHead(404, 'Not Found')
          res.end()
          return
        }

        res.setHeader('content-type', 'application/json')
        res.end(JSON.stringify(datum))
        return
      }

      res.writeHead(404, 'Not Found')
      res.end()
      return
    }
  } as Record<string, (req: IncomingMessage, res: ServerResponse) => void>
  const server = createServer((req, res) => {
    withAsyncLocalWantedStorage(async () => {
      await wantAsync(DatabaseProvider)
      const url = req.url ?? '/'
      const handler = handlers[url]
      if (!handler) {
        res.writeHead(404, 'Not Found')
        res.end()
        return
      }
      handler(req, res)
    })
  })
  const close = async () => {
    const { resolve, promise } = Promise.withResolvers<Error | undefined>()
    server.close(resolve)
    const error = await promise
    if (!error) return
    console.error("server closed with error", error)
  }
  server.listen(() => {
    const address = server.address()
    if (address === null) {
      const { resolve, promise } = Promise.withResolvers<Error | undefined>()
      server.close(resolve)
      promise.then((error) => {
        if (error) {
          console.error("Cannot figure out port number, server closed with error", error)
        } {
          console.error("Cannot figure out port number, server closed")
        }
        reject(new Error("Cannot figure out port number, server closed", { cause: error }))
      })
      return;
    }
    if (typeof address === "string") {
      resolve({ close, address: address.replace('//:::', '//localhost:') })
      return
    }
    resolve({ close, address: `http://${address.address.replace('::', 'localhost')}:${address.port}` })
  })
  return promise
}

