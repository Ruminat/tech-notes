### AutoHotKey

`CapsLock.ahk`:

```
SetCapsLockState, AlwaysOff
+CapsLock::CapsLock

CapsLock::Send, {Alt down}{Shift down}{Shift up}{Alt up}{Alt up}
return
```

You should also [add it to startup](../cmd/AddToStartup.md).
