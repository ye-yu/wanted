# wanted

`wanted` is a small dependency-injection helper for JavaScript and TypeScript. A
class declares its setup in `want()` or `wantAsync()`, and callers ask for an
instance with `want()` or `wantAsync()`. Instances are cached as singletons
within a selected storage scope.

## Install

```sh
npm install @ye-yu/wanted
```

## Quick start

Define your singleton classes by extending `Wantable` or `WantableAsync`

```ts
import { Wantable, WantableAsync, want, wantAsync } from "@ye-yu/wanted";
class CommonLogger extends Wantable() {
  want() {}
}

class IdProvider extends Wantable() {
  logger!: CommonLogger
  want() {
    this.logger = want(CommonLogger)
  }
  newId() {
    return crypto.randomUUID()
  }
}

class DatabaseService extends Wantable() {
  logger!: CommonLogger
  connected = false

  async connect() {
    // template
  }
  async wantAsync() {
    this.logger = want(CommonLogger)
    await this.connect()
  }
}

// or extend another plain class or wantable
class UserService extends WantableAsync(IdProvider) {
  database!: DatabaseService
  async wantAsync() {
    super.want()
    this.database = await wantAsync(DatabaseProvider)
  }
  async createNewUser(userData: UserData) {
    const id = this.newId()
    return await this.database.create({ ...userData, id })
  }
}
```

Use your singleton everywhere!

```ts
async function getUserData() {
  const userService = await wantAsync(UserService)
  const logger = want(CommontLogger)
  logger.info("getUserData")
  return await userService.getUserData()
}

async function compareLogger() {
  const userService = await wantAsync(UserService)
  const databaseService = await wantAsync(DatabaseService)

  console.log(
    "same logger instance", 
    // true!
    userService.logger === databaseService.logger)
}
```


## Define and request dependencies

Extend `Wantable()` and implement `want()`. `want()` runs when the instance is
first created in a storage scope; subsequent requests from that scope return
the same instance without running setup again.

```ts
import { Wantable, want } from "@ye-yu/wanted";

class Logger extends Wantable() {
  want() {
    // Set up the logger here.
  }

  log(message: string) {
    console.log(message);
  }
}

class UserRepository extends Wantable() {
  logger!: Logger;

  want() {
    this.logger = want(Logger);
  }
}

const first = want(UserRepository);
const second = want(UserRepository);

console.log(first === second); // true
console.log(first.logger === want(Logger)); // true
```

Each class MUST have a no-argument constructor. Dependencies are requested
inside `want()` by calling `want(DependencyClass)`. The same dependency class
requested by different services resolves to the same instance when both
requests use the same storage.

For asynchronous initialization, extend `WantableAsync()` and implement
`wantAsync()`. Request the instance with `await wantAsync(...)`:

```ts
import { WantableAsync, wantAsync } from "@ye-yu/wanted";

class Database extends WantableAsync() {
  connected = false;

  async wantAsync() {
    await connectToDatabase();
    this.connected = true;
    // you may also call `want(Something)` or `wantAsync(SomethingAsync)` here
    // ...
  }
}

const database = await wantAsync(Database);
console.log(database.connected); // true
```

Dependencies in asynchronous setup should also be requested with
`await wantAsync(...)`:

```ts
class ReportService extends WantableAsync() {
  database!: Database;

  async wantAsync() {
    this.database = await wantAsync(Database);
  }
}
```

## Define wantable extending from another class

`Wantable()` and `WantableAsync()` can also take a parent class. This lets a
wantable class inherit a pre-existing implementation:

```ts
class BaseLogger {
  log(message: string) {
    console.log(message);
  }
}

class AppLogger extends Wantable(BaseLogger) {
  want() {
    // Optional setup; inherited methods remain available.
  }
}
```

The parent class can have a constructor of any arguments.
You may supply the super constructor arguments in your wantable 
class constructor.

```ts
import { Wantable } from "@ye-yu/wanted";

class BaseLogger {
  readonly prefix: string
  constructor(prefix = "") {
    this.prefix = prefix;
  }
}

class UserLogger extends Wantable(BaseLogger) {
  constructor() {
    super("user")
  }
  want() {
    // your dependencies
  }
}

```

## `Wantable` too verbose with `want()` method?
You can skip `want` implementation and directly `want` from constructor. However,
you can only want a sync wantable and never an async constructor.

You can perform this using `WantableByConstructor`.

```ts
import { WantableByConstructor } from "@ye-yu/wanted";

class CommonLogger extends WantableByConstructor() {
  constructor() {
    this.target = "cli"
  }

  // noop want is already supplied
  // want() {}
}

class UserService extends WantableByConstructor() {
  readonly logger: CommonLogger;
  constructor() {
    this.logger = want(CommonLogger)
    this.logger.info("UserService")
  }
}

// or directly

class DatabaseService extends WantableByConstructor() {
  readonly logger = want(CommonLogger)
}
```

## GLOBAL and ASYNC_LOCAL storage

The second argument to `want()` or `wantAsync()` selects where the singleton is
stored. It accepts the string `"GLOBAL"` or `"ASYNC_LOCAL"` and defaults to
`"GLOBAL"`. You can access this enum by importing the object `WANT_FROM`.

| Storage | Lifetime and sharing |
| --- | --- |
| `"GLOBAL"` | One shared registry for the process/module instance. Calls from different requests and async contexts reuse the same instance of a class. |
| `"ASYNC_LOCAL"` | A registry for the current `withAsyncLocalWantedStorage()` scope. Calls in the same async execution scope share an instance; a separately started scope gets a distinct instance. |

### GLOBAL: share process-wide services

Use the default for services that should be shared across requests, such as a
database client or application logger:

```ts
const logger = want(Logger); // Equivalent to want(Logger, "GLOBAL")
const database = await wantAsync(Database);
```

Repeated requests for the same class in GLOBAL storage return the same
instance. A dependency requested from a GLOBAL service also uses GLOBAL storage
unless you explicitly select another storage.

### ASYNC_LOCAL: isolate per-operation state

Use ASYNC_LOCAL for values that belong to one request or other asynchronous
operation, such as a request ID or per-request context. The lookup must happen
inside a `withAsyncLocalWantedStorage()` callback, and the storage must be
selected explicitly:

```ts
import {
  Wantable,
  want,
  withAsyncLocalWantedStorage,
  WANT_FROM,
} from "@ye-yu/wanted";

class RequestContext extends Wantable() {
  requestId = "";

  want() {
    this.requestId = crypto.randomUUID();
  }
}

function handleRequest() {
  withAsyncLocalWantedStorage(async () => {
    const context = want(RequestContext, WANT_FROM.ASYNC_LOCAL);
    console.log(context.requestId);

    // Async work started here continues in this async-local scope.
    await doRequestWork(context);
  });
}
```

Call `handleRequest()` separately for each operation that needs isolated
state. Two requests made within one scope share its `RequestContext`; separate
scopes receive different instances. Calling `want(SomeClass, "ASYNC_LOCAL")`
without an active `withAsyncLocalWantedStorage()` scope throws an error.

Storage selection applies to each request for an instance; it is not inferred
from the current async context. For example, this request-local service uses a
GLOBAL logger because the dependency lookup omits the storage argument:

```ts
class RequestService extends Wantable() {
  logger!: Logger;

  want() {
    this.logger = want(Logger); // GLOBAL
  }
}

withAsyncLocalWantedStorage(() => {
  const service = want(RequestService, WANT_FROM.ASYNC_LOCAL);
  // service is ASYNC_LOCAL; service.logger is GLOBAL.
});
```

A dependency chain may begin in ASYNC_LOCAL and request GLOBAL dependencies.
However, a chain that begins in GLOBAL cannot switch to ASYNC_LOCAL partway
through its initialization. Keep request-scoped dependencies in an
ASYNC_LOCAL-started chain.

## Circular dependencies

The resolver supports circular dependencies. During setup, a dependency can
refer back to an instance that is still being initialized; once setup finishes,
the resolved references point to the instances:

```ts
class IdProvider extends Wantable() {
  nameProvider!: NameProvider;

  want() {
    this.nameProvider = want(NameProvider);
  }
}

class NameProvider extends Wantable() {
  idProvider!: IdProvider;

  want() {
    this.idProvider = want(IdProvider);
  }
}

const ids = want(IdProvider);
console.log(ids.nameProvider.idProvider === ids); // true
```

The same resolution behavior is available to `WantableAsync()` classes using
`wantAsync()` in their asynchronous setup.

## API

- `Wantable(parent?)`: class factory for synchronous wantables. Subclasses
  implement `want(): void`.
- `WantableAsync(parent?)`: class factory for asynchronous wantables. Subclasses
  implement `wantAsync(): Promise<void>`.
- `want(Class, from?)`: synchronously initialize and return a wantable
  instance. `from` is `"GLOBAL"` by default and may be `"ASYNC_LOCAL"`.
- `wantAsync(Class, from?)`: asynchronously initialize and return a promise for
  a wantable instance. It accepts the same storage argument.
- `withAsyncLocalWantedStorage(callback)`: run a callback in a new async-local
  wanted-storage scope. Use it to establish request/operation isolation.
