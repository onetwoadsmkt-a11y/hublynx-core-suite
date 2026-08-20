// Server-only — sockets TCP/TLS para IMAP e SMTP.
// Nunca importar no browser. Funciona tanto no runtime de edge (cloudflare:sockets)
// quanto no dev em Node (node:net / node:tls).

export type MailSocket = {
  read(timeoutMs?: number): Promise<string>;
  write(data: string): Promise<void>;
  startTls(): Promise<void>;
  close(): Promise<void>;
};

const DEFAULT_TIMEOUT = 12_000;

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timeout:${label}`)), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

/* ------------------------------ Cloudflare ------------------------------ */

async function openEdgeSocket(
  host: string,
  port: number,
  tls: boolean,
): Promise<MailSocket | null> {
  let connect: any;
  try {
    ({ connect } = await import(/* @vite-ignore */ "cloudflare:sockets"));
  } catch {
    return null;
  }
  if (!connect) return null;

  let socket = connect(
    { hostname: host, port },
    { secureTransport: tls ? "on" : "starttls", allowHalfOpen: false },
  );
  let reader = socket.readable.getReader();
  let writer = socket.writable.getWriter();
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();

  return {
    async read(timeoutMs = DEFAULT_TIMEOUT) {
      const { value, done } = await withTimeout(reader.read(), timeoutMs, "read");
      if (done || !value) return "";
      return decoder.decode(value);
    },
    async write(data) {
      await writer.write(encoder.encode(data));
    },
    async startTls() {
      await writer.close().catch(() => {});
      reader.releaseLock();
      socket = socket.startTls();
      reader = socket.readable.getReader();
      writer = socket.writable.getWriter();
    },
    async close() {
      try {
        await writer.close();
      } catch {
        /* ignore */
      }
      try {
        await socket.close();
      } catch {
        /* ignore */
      }
    },
  };
}

/* --------------------------------- Node --------------------------------- */

async function openNodeSocket(host: string, port: number, tls: boolean): Promise<MailSocket> {
  const net = await import("node:net");
  const tlsMod = await import("node:tls");

  let current: any;
  let queue: string[] = [];
  let waiter: ((v: string) => void) | null = null;
  let failure: Error | null = null;

  const bind = (sock: any) => {
    current = sock;
    sock.setEncoding("utf8");
    sock.on("data", (chunk: string) => {
      if (waiter) {
        const w = waiter;
        waiter = null;
        w(chunk);
      } else queue.push(chunk);
    });
    sock.on("error", (err: Error) => {
      failure = err;
      if (waiter) {
        const w = waiter;
        waiter = null;
        w("");
      }
    });
  };

  const connectPlain = () =>
    new Promise<any>((resolve, reject) => {
      const s = net.connect({ host, port });
      s.once("connect", () => resolve(s));
      s.once("error", reject);
    });

  const connectTls = (socket?: any) =>
    new Promise<any>((resolve, reject) => {
      const s = tlsMod.connect({ host, port, servername: host, socket });
      s.once("secureConnect", () => resolve(s));
      s.once("error", reject);
    });

  bind(tls ? await connectTls() : await connectPlain());

  return {
    async read(timeoutMs = DEFAULT_TIMEOUT) {
      if (failure) throw failure;
      if (queue.length) return queue.shift() as string;
      return withTimeout(
        new Promise<string>((resolve) => {
          waiter = resolve;
        }),
        timeoutMs,
        "read",
      ).then((v) => {
        if (failure) throw failure;
        return v;
      });
    },
    async write(data) {
      await new Promise<void>((resolve, reject) =>
        current.write(data, (err?: Error | null) => (err ? reject(err) : resolve())),
      );
    },
    async startTls() {
      const plain = current;
      plain.removeAllListeners("data");
      plain.removeAllListeners("error");
      queue = [];
      bind(await connectTls(plain));
    },
    async close() {
      try {
        current.end();
        current.destroy();
      } catch {
        /* ignore */
      }
    },
  };
}

export async function openMailSocket(
  host: string,
  port: number,
  tls: boolean,
): Promise<MailSocket> {
  const edge = await openEdgeSocket(host, port, tls);
  if (edge) return edge;
  return openNodeSocket(host, port, tls);
}

/** Leitor de linhas por cima do socket. */
export function createLineReader(socket: MailSocket) {
  let buffer = "";
  return {
    /** Lê linhas até `isDone(linhaCompleta)` retornar true. Devolve o bloco lido. */
    async until(isDone: (line: string) => boolean, timeoutMs = DEFAULT_TIMEOUT): Promise<string> {
      const started = Date.now();
      const collected: string[] = [];
      for (;;) {
        let nl = buffer.indexOf("\n");
        while (nl >= 0) {
          const line = buffer.slice(0, nl).replace(/\r$/, "");
          buffer = buffer.slice(nl + 1);
          collected.push(line);
          if (isDone(line)) return collected.join("\n");
          nl = buffer.indexOf("\n");
        }
        const remaining = timeoutMs - (Date.now() - started);
        if (remaining <= 0) throw new Error("timeout:read");
        const chunk = await socket.read(remaining);
        if (!chunk) throw new Error("closed");
        buffer += chunk;
      }
    },
    reset() {
      buffer = "";
    },
  };
}
