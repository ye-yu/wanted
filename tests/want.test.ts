import { beforeEach, describe, it } from "node:test";
import { want, Wantable } from "../src/want.ts";
import assert from "assert";
import { clearAllWants, WANTED_IS_PROXY_SYMBOL } from "../src/storage.ts";

describe('want sync', () => {
  beforeEach(clearAllWants)

  it('should be able to resolve first level wants', () => {
    const logger1 = want(Logger)
    const logger2 = want(Logger)
    assert.strictEqual(logger1, logger2)
  })

  it('should be able to resolve single-level nested dependencies', () => {
    const storage = want(Storage)
    const idGenerator = want(IdGenerator)
    assert.strictEqual(storage.logger, idGenerator.logger)

    const storageLoggerIsProxy = Reflect.get(storage.logger, WANTED_IS_PROXY_SYMBOL)
    assert.ok(!storageLoggerIsProxy)

    const idGeneratorLoggerIsProxy = Reflect.get(idGenerator.logger, WANTED_IS_PROXY_SYMBOL)
    assert.ok(!idGeneratorLoggerIsProxy)
  })

  it('should be able to resolve circular dependencies', () => {
    const idProvider = want(IdProvider)
    const nameProvider = want(NameProvider)
    assert.strictEqual(idProvider.nameProvider, nameProvider)
    assert.strictEqual(nameProvider.idProvider, idProvider)
  })
})

// class templates

// base wantable
class Logger extends Wantable() {
  want(): void {
  }
  name() {
    return this.constructor.name
  }
}


// depends on Logger
class IdGenerator extends Wantable() {
  logger!: Logger
  want(): void {
    this.logger = want(Logger)
  }
  name() {
    return this.constructor.name
  }
}

// depends on Logger
class Storage extends Wantable() {
  logger!: Logger
  want(): void {
    this.logger = want(Logger)
  }
  name() {
    return this.constructor.name
  }
}

// depends circularly
class IdProvider extends Wantable() {
  nameProvider!: NameProvider
  want(): void {
    this.nameProvider = want(NameProvider)
  }
  name() {
    return this.constructor.name
  }
}

class NameProvider extends Wantable() {
  idProvider!: IdProvider
  want(): void {
    this.idProvider = want(IdProvider)
  }
  name() {
    return this.constructor.name
  }
}

// parent is a wantable
class NamedLogger extends Wantable(Logger) {
}

// parent is not a wantable
class TypeProvider {
  name() {
    return this.constructor.name
  }
}

class SubTypeProvider extends Wantable(TypeProvider) {
  want() {}
}