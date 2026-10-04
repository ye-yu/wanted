import { beforeEach, describe, it } from "node:test";
import { wantAsync, WantableAsync } from "../src/want.ts";
import assert from "assert";
import { clearAllWants, WANTED_IS_PROXY_SYMBOL } from "../src/storage.ts";

describe('want async', () => {
  beforeEach(clearAllWants)

  it('should be able to resolve first level wants', async () => {
    const logger1 = await wantAsync(Logger)
    const logger2 = await wantAsync(Logger)
    assert.strictEqual(logger1, logger2)
  })

  it('should be able to resolve single-level nested dependencies', async () => {
    const storage = await wantAsync(Storage)
    const idGenerator = await wantAsync(IdGenerator)
    assert.strictEqual(storage.logger, idGenerator.logger)

    const storageLoggerIsProxy = Reflect.get(storage.logger, WANTED_IS_PROXY_SYMBOL)
    assert.ok(!storageLoggerIsProxy)

    const idGeneratorLoggerIsProxy = Reflect.get(idGenerator.logger, WANTED_IS_PROXY_SYMBOL)
    assert.ok(!idGeneratorLoggerIsProxy)
  })

  it('should be able to resolve circular dependencies', async () => {
    const idProvider = await wantAsync(IdProvider)
    const nameProvider = await wantAsync(NameProvider)
    assert.strictEqual(idProvider.nameProvider, nameProvider)
    assert.strictEqual(nameProvider.idProvider, idProvider)
  })
})

// class templates

// base wantable
class Logger extends WantableAsync() {
  async wantAsync(): Promise<void> {
  }
  name() {
    return this.constructor.name
  }
}


// depends on Logger
class IdGenerator extends WantableAsync() {
  logger!: Logger
  async wantAsync(): Promise<void> {
    this.logger = await wantAsync(Logger)
  }
  name() {
    return this.constructor.name
  }
}

// depends on Logger
class Storage extends WantableAsync() {
  logger!: Logger
  async wantAsync(): Promise<void> {
    this.logger = await wantAsync(Logger)
  }
  name() {
    return this.constructor.name
  }
}

// depends circularly
class IdProvider extends WantableAsync() {
  nameProvider!: NameProvider
  async wantAsync(): Promise<void> {
    this.nameProvider = await wantAsync(NameProvider)
  }
  name() {
    return this.constructor.name
  }
}

class NameProvider extends WantableAsync() {
  idProvider!: IdProvider
  async wantAsync(): Promise<void> {
    this.idProvider = await wantAsync(IdProvider)
  }
  name() {
    return this.constructor.name
  }
}

// parent is a wantable
class NamedLogger extends WantableAsync(Logger) {
}

// parent is not a wantable
class TypeProvider {
  name() {
    return this.constructor.name
  }
}

class SubTypeProvider extends WantableAsync(TypeProvider) {
  async wantAsync() { }
}