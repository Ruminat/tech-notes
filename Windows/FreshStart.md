# My fresh start guide on Windows

Start with installing [choco](https://chocolatey.org/install):
```bash
Set-ExecutionPolicy Bypass -Scope Process -Force; [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor 3072; iex ((New-Object System.Net.WebClient).DownloadString('https://community.chocolatey.org/install.ps1'))
```

Install the essentials:
```bash
choco install git -y
choco install firefox -y
choco install telegram -y
choco install steam -y
choco install sumatrapdf -y
choco install IrfanView -y
choco install irfanviewplugins -y
choco install musicbee -y
choco install keypirinha -y
choco install mpc-hc -y
choco install winrar -y
choco install lightshot.install -y
```

Install the ones that are not in the choco:
- [Cursor](https://cursor.com/download)
- [Sublime Text](https://www.sublimetext.com/download_thanks?target=win-x64)

### Keypirinha settings

```
[app]
hotkey_run = Alt+Space
```
