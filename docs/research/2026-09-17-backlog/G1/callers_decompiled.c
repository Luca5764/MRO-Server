// =============================================================================
// UnrealScript Native Callers of ZDispatchGame::Assist_CN
// =============================================================================

// --- 1. execGame_Assist (0x1071bc30) ---
// UnrealScript: native static function Game_Assist( int UserIndex, int AssistUserIndex, int HPPercent, int ActionType );
// Script call in DefaultMech.uc:3659:
//   class'ZNetwork.ZNetwork_DJ'.static.Game_Assist( UserIndex, AssistIndex, HPPercent, 1 ); // 1: attack
// Script call in DefaultMech.uc:3787:
//   class'ZNetwork.ZNetwork_DJ'.static.Game_Assist( UserIndex, AssistIndex, HPPercent, 2 ); // 2: repair
void FUN_1071bc30(FFrame *Stack)
{
    int UserIndex = 0;       // local_18
    int AssistIndex = 0;     // local_1c
    int HPPercent = 0;       // local_20
    int ActionType = 0;      // local_24
    Stack->Step(Stack->Object, &UserIndex);
    Stack->Step(Stack->Object, &AssistIndex);
    Stack->Step(Stack->Object, &HPPercent);
    Stack->Step(Stack->Object, &ActionType);
    if (*(char*)Stack->Code == 0x42) { // EX_EndFunctionParms
        Stack->Code++;
    }
    int AssistType = 1;
    if (UserIndex == AssistIndex || AssistIndex == 0) {
        AssistType = 4; // Self-damage, environmental, or no distinct player assist
    }
    ZDispatchGame::Assist_CN(&DAT_108e7e88, UserIndex, ActionType, AssistIndex, HPPercent, AssistType);
}

// --- 2. execGame_Boss_Damage (0x1071c3e0) ---
// UnrealScript: native static function Game_Boss_Damage( int UserIndex, int TargetIndex, int BossHP );
void FUN_1071c3e0(FFrame *Stack)
{
    int UserIndex = 0;
    int TargetIndex = 0;
    int BossHP = 0;
    Stack->Step(Stack->Object, &UserIndex);
    Stack->Step(Stack->Object, &TargetIndex);
    Stack->Step(Stack->Object, &BossHP);
    if (*(char*)Stack->Code == 0x42) Stack->Code++;
    ZDispatchGame::Assist_CN(&DAT_108e7e88, 0, 1, UserIndex, BossHP, 2);
}

// --- 3. execGame_TwoBoss_Damage (0x1071c6f0) ---
// UnrealScript: native static function Game_TwoBoss_Damage( int UserIndex, int TargetIndex, int BossHP );
void FUN_1071c6f0(FFrame *Stack)
{
    int UserIndex = 0;
    int TargetIndex = 0;
    int BossHP = 0;
    Stack->Step(Stack->Object, &UserIndex);
    Stack->Step(Stack->Object, &TargetIndex);
    Stack->Step(Stack->Object, &BossHP);
    if (*(char*)Stack->Code == 0x42) Stack->Code++;
    ZDispatchGame::Assist_CN(&DAT_108e7e88, 0, 1, UserIndex, BossHP, 0x1b);
}

// --- 4. execGame_TwoBoss_Heal (0x1071c880) ---
// UnrealScript: native static function Game_TwoBoss_Heal( int UserIndex, int TargetIndex, int BossHP );
void FUN_1071c880(FFrame *Stack)
{
    int UserIndex = 0;
    int TargetIndex = 0;
    int BossHP = 0;
    Stack->Step(Stack->Object, &UserIndex);
    Stack->Step(Stack->Object, &TargetIndex);
    Stack->Step(Stack->Object, &BossHP);
    if (*(char*)Stack->Code == 0x42) Stack->Code++;
    ZDispatchGame::Assist_CN(&DAT_108e7e88, 0, 2, UserIndex, BossHP, 0x1c);
}

// --- 5. execGame_Campaign_Damage (0x1071ccf0) ---
// UnrealScript: native static function Game_Campaign_Damage( int UserIndex, int TargetIndex, int TargetHP );
void FUN_1071ccf0(FFrame *Stack)
{
    int UserIndex = 0;
    int TargetIndex = 0;
    int TargetHP = 0;
    Stack->Step(Stack->Object, &UserIndex);
    Stack->Step(Stack->Object, &TargetIndex);
    Stack->Step(Stack->Object, &TargetHP);
    if (*(char*)Stack->Code == 0x42) Stack->Code++;
    // TargetIndex filter for campaign boss / core objectives:
    // 0x3f6 (1014), 0x403 (1027), 0x404 (1028), 0x437 (1079), 0x468 (1128)
    if (TargetIndex == 0x3f6 || TargetIndex == 0x403 || TargetIndex == 0x404 ||
        TargetIndex == 0x437 || TargetIndex == 0x468) {
        ZDispatchGame::Assist_CN(&DAT_108e7e88, 0, 1, UserIndex, TargetHP, 0x16);
    }
}

