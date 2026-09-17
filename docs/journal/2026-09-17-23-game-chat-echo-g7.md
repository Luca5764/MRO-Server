# G7 實作：遊戲內隊伍與全體聊天回顯（0x00220507／0x00220509）（待審）

## 1. 目標與背景

- **任務契約**：`docs/backlog.md` 之 G7 任務。
- **問題現狀**：
  - 玩家在戰鬥中輸入 Team 聊天（`0x00220507`）或 All 聊天（`0x00220509`）時，伺服器先前的 `gate.game.dispatch.js` 落在 `default:` 分支。
  - 因為 opcode 為奇數，伺服器自動回應了 `type + 1`（`0x00220508`／`0x0022050a`）加上 6 bytes 空 `EVENT_INFO`。
  - 但客戶端 dispatcher 根本沒有註冊這兩個 opcode，訊息被靜默忽略，畫面上未顯示任何聊天文字。
- **協定依據**：
  - 依據 G3 分析（`docs/journal/2026-09-17-17-game-chat-broadcast-format.md`，Claude 已抽查）：
    - All 頻道：C→S `0x00220509`，S→C `0x00220509`（相同 opcode，258 bytes body）。
    - Team 頻道：C→S `0x00220507`，S→C `0x00220507`（相同 opcode，258 bytes body）。
    - Body 格式：`+0x00` uint16 0（保留／未讀），`+0x02` ANSI 格式 `"<Nick>  <Msg>\0"`（雙空格切分）。
    - 客戶端在 `Community_Chat_Add` 依雙空格切割發話者與訊息，由 `DefaultHud.uc:1129-1140` 依 Type 印在 HUD 上。

## 2. 實作內容

- **修改檔案**：`Metal Rage Online Server/dispatch/gate.game.dispatch.js`
- **開關變數**：
  ```javascript
  const GAME_CHAT_ECHO_MODE = 'disabled'; // 'disabled' | 'enabled'
  ```
  （commit 時維持預設 `disabled`）
- **Dispatch 邏輯**：
  在 `switch (type)` 中新增 `0x00220507` 與 `0x00220509`：
  ```javascript
  case 0x00220507: // Chat_Game_Team_CN
  case 0x00220509: // Chat_Game_All_CN
  {
      if (GAME_CHAT_ECHO_MODE !== 'enabled') {
          break;
      }

      const channelName = (type === 0x00220507) ? 'Team' : 'All';
      const textPreview = body.length > 2 ? body.subarray(2).toString('latin1').split('\0')[0] : '';
      console.log(`[ZGateGameDispatch] >> In-game chat ${channelName} (0x${type.toString(16).padStart(8, '0')}): "${textPreview}" (${body.length} bytes)`);

      const [msg, respBody] = getExactMessageBuffer(type, body.length);
      body.copy(respBody);
      client.send(msg);
      return true;
  }
  ```
  - 當開關為 `enabled` 時，使用 `getExactMessageBuffer` 配置包含 16 bytes header 與 258 bytes body 的 exact buffer（總長 274 bytes / 0x112），原樣回顯給客戶端自己。
  - 當開關為 `disabled` 時，`break` 落入既有 `default:` fallback 分支。

## 3. 測試步驟（待實測）

1. 於 worktree 暫時切換 `GAME_CHAT_ECHO_MODE = 'enabled'`。
2. 啟動伺服器：`cd "/home/lucas/mro-reverse-g7/Metal Rage Online Server" && npm start`。
3. 進入 PvE 關卡。
4. 輸入隊伍聊天與全體聊天，確認畫面是否正常顯示訊息。
5. 實測完成後改回 `disabled` 並記錄結果。
