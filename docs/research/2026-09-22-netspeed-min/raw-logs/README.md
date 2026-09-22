# NETSPEED-MIN（30000 自動化三輪）的原始客戶端 log

2026-09-23 從 `C:\Games\MetalRage Online\data\System` 收進來的，**加入者**那一台的
`run-*.log`。在此之前只有 `run-tally.txt` 的計數，原始檔留在客戶端安裝目錄，
清理客戶端就會消失（Sol 跨公司審查指出的證據可攜性問題）。

- 分組與逐輪計數見 `../run-tally.txt`。
- 缺口的算法：分母是 `HitLoc===` 行數，分子是缺少的 `MTE_a Fire`。
  彈藥一次扣兩發，**不能用彈藥數當分母**。
- **房主真實 VPN 位址已遮成 `<HOST_VPN_IP>`**（`GameStart`／`Browse:`／
  `Close TcpipConnection` 行），其餘逐 byte 未改。
