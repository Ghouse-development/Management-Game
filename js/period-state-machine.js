// ==============================================
// period-state-machine.js - 期間フェーズ管理
// ==============================================

/**
 * 期間フェーズの状態機械
 *
 * フェーズ遷移:
 *   IDLE → DICE_ROLL → PERIOD_START → MID_PERIOD → PERIOD_END → SETTLEMENT → IDLE
 *
 * 2期の場合:
 *   IDLE → PERIOD_START → MID_PERIOD → PERIOD_END → SETTLEMENT → IDLE
 */
const PeriodStateMachine = {
    // 状態定義
    STATES: {
        IDLE: 'IDLE',                    // 待機中（ゲーム開始前/終了後）
        DICE_ROLL: 'DICE_ROLL',          // サイコロ振り中（3期以降）
        PERIOD_START: 'PERIOD_START',    // 期首処理中
        MID_PERIOD: 'MID_PERIOD',        // 期中（通常プレイ）
        PERIOD_END: 'PERIOD_END',        // 期末処理中
        SETTLEMENT: 'SETTLEMENT',        // 決算表示中
        GAME_END: 'GAME_END'             // ゲーム終了
    },

    // イベント定義
    EVENTS: {
        START_GAME: 'START_GAME',
        ROLL_DICE: 'ROLL_DICE',
        DICE_COMPLETE: 'DICE_COMPLETE',
        START_PERIOD: 'START_PERIOD',
        ROW_EXHAUSTED: 'ROW_EXHAUSTED',
        TRIGGER_PERIOD_END: 'TRIGGER_PERIOD_END',
        START_SETTLEMENT: 'START_SETTLEMENT',
        SETTLEMENT_COMPLETE: 'SETTLEMENT_COMPLETE',
        NEXT_PERIOD: 'NEXT_PERIOD',
        END_GAME: 'END_GAME'
    },

    // 遷移テーブル
    transitions: {
        'IDLE': {
            'START_GAME': 'PERIOD_START',      // 2期開始
            'ROLL_DICE': 'DICE_ROLL'           // 3期以降開始
        },
        'DICE_ROLL': {
            'DICE_COMPLETE': 'PERIOD_START'
        },
        'PERIOD_START': {
            'START_PERIOD': 'MID_PERIOD'
        },
        'MID_PERIOD': {
            'ROW_EXHAUSTED': 'PERIOD_END',
            'TRIGGER_PERIOD_END': 'PERIOD_END'
        },
        'PERIOD_END': {
            'START_SETTLEMENT': 'SETTLEMENT'
        },
        'SETTLEMENT': {
            'SETTLEMENT_COMPLETE': 'IDLE',     // 次期へ（IDLEに戻る）
            'END_GAME': 'GAME_END'
        },
        'GAME_END': {
            // 終了状態（遷移なし）
        }
    },

    /**
     * 現在のフェーズを取得
     */
    getCurrentPhase() {
        return gameState.periodPhase || this.STATES.IDLE;
    },

    /**
     * フェーズを設定
     */
    setPhase(phase) {
        const oldPhase = gameState.periodPhase;
        gameState.periodPhase = phase;
        console.log(`[PeriodStateMachine] Phase: ${oldPhase} → ${phase}`);

        // フェーズ変更イベントを発火
        if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('periodPhaseChanged', {
                detail: { oldPhase, newPhase: phase }
            }));
        }
    },

    /**
     * イベントに基づいてフェーズを遷移
     * @param {string} event - イベント名
     * @returns {boolean} 遷移成功かどうか
     */
    transition(event) {
        const currentPhase = this.getCurrentPhase();
        const allowedTransitions = this.transitions[currentPhase];

        if (!allowedTransitions) {
            console.error(`[PeriodStateMachine] No transitions defined for phase: ${currentPhase}`);
            return false;
        }

        const nextPhase = allowedTransitions[event];
        if (!nextPhase) {
            console.warn(`[PeriodStateMachine] Invalid transition: ${currentPhase} + ${event}`);
            return false;
        }

        this.setPhase(nextPhase);
        return true;
    },

    /**
     * 特定のフェーズかどうかを確認
     */
    isPhase(phase) {
        return this.getCurrentPhase() === phase;
    },

    /**
     * 期中かどうか
     */
    isMidPeriod() {
        return this.isPhase(this.STATES.MID_PERIOD);
    },

    /**
     * 期末処理中かどうか
     */
    isPeriodEnding() {
        return this.isPhase(this.STATES.PERIOD_END) ||
               this.isPhase(this.STATES.SETTLEMENT);
    },

    /**
     * ゲーム終了かどうか
     */
    isGameEnd() {
        return this.isPhase(this.STATES.GAME_END);
    },

    /**
     * 新しいゲームを開始
     */
    startNewGame(period = 2) {
        this.setPhase(this.STATES.IDLE);
        if (period >= 3) {
            this.transition(this.EVENTS.ROLL_DICE);
        } else {
            this.transition(this.EVENTS.START_GAME);
        }
    },

    /**
     * 次の期へ進む
     */
    proceedToNextPeriod(nextPeriod) {
        if (nextPeriod > 5) {
            this.transition(this.EVENTS.END_GAME);
        } else if (nextPeriod >= 3) {
            this.setPhase(this.STATES.IDLE);
            this.transition(this.EVENTS.ROLL_DICE);
        } else {
            this.setPhase(this.STATES.IDLE);
            this.transition(this.EVENTS.START_GAME);
        }
    },

    /**
     * デバッグ: 現在の状態を表示
     */
    debug() {
        const phase = this.getCurrentPhase();
        const transitions = this.transitions[phase];
        console.log(`[PeriodStateMachine] Current: ${phase}`);
        console.log(`[PeriodStateMachine] Available events:`, Object.keys(transitions || {}));
    }
};

// グローバル公開
if (typeof window !== 'undefined') {
    window.PeriodStateMachine = PeriodStateMachine;
    window.PERIOD_STATES = PeriodStateMachine.STATES;
    window.PERIOD_EVENTS = PeriodStateMachine.EVENTS;
}
