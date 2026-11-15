# Security policy

Reconio is a security tool, so its own security matters. Thank you for helping keep it and its users safe.

## Supported versions

| Version | Supported |
|---|---|
| 0.1.x (pre-alpha, `main`) | ✅ |

Until 1.0, only the latest commit on `main` gets fixes.

## Reporting a vulnerability

**Please don't open a public issue for security problems.** Contact the maintainer privately through their [GitHub profile](https://github.com/Madhavv13) instead. Include:

- what the problem is and where it is (file, command or screen);
- steps to reproduce it, or a proof of concept;
- the impact as you see it;
- the Reconio commit or version, and your OS.

You can expect an acknowledgement within 7 days and a status update at least every 14 days until it's resolved. Please give the issue a reasonable time to be fixed before you disclose it.

## What's in scope

We especially want to hear about:

- anything that lets the webview start a process, pass tool arguments or read files outside the IPC commands;
- a way to make the supervisor run a tool with an update or proxy flag, from `PATH`, or with a binary whose checksum doesn't match `tools.lock.json`;
- scope decisions that are wrong, for example a host judged *in scope* when an out-of-scope rule should win;
- API keys leaking out of the OS keychain into a database, log, export or the UI;
- a tool process that keeps running after Reconio exits.

## Using Reconio responsibly

Reconio is for authorized testing only. Reports about Reconio being used against targets someone isn't authorized to test are a matter for that target's owner and the relevant authorities, not a vulnerability in Reconio.
