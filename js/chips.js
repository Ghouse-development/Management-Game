/**
 * MG (Management Game) - チップ購入関連関数
 *
 * 保険チップ、戦略チップ（研究・教育・広告）の購入処理
 */

// ============================================
// 保険チップ購入
// ============================================
function showInsurancePurchaseModal() {
    const company = gameState.companies[0];

    if (company.chips.insurance > 0) {
        showToast('すでに保険に加入しています', 'warning', 3000);
        return;
    }

    const content = `
        <div class="form-group">
            <label class="form-label">保険チップ購入</label>
            <p style="font-size: 12px; color: #666;">価格：¥5<br>効果：火災・盗難時に保険金受取（使用後消費）</p>
        </div>
        <button class="submit-btn" onclick="buyInsurance()">購入(¥5)</button>
    `;

    showModal('保険チップ購入', content);
}

function buyInsurance() {
    const company = gameState.companies[0];

    if (company.cash < 5) {
        showToast('現金が不足しています', 'danger', 3000);
        return;
    }

    company.cash -= 5;
    company.chips.insurance = 1;

    closeModal();
    showToast('保険チップを購入しました（¥5）', 'success', 3000);

    // カードを引く
    drawCard();
}

// ============================================
// 戦略チップ購入モーダル
// ============================================
function showChipModal(specificType = null) {
    const period = gameState.currentPeriod;
    const company = gameState.companies[0];

    const chipInfo = {
        research: { name: '研究', icon: '🔬', color: '#4a90d9', border: '#1e4a7a', desc: '価格競争力+2円' },
        education: { name: '教育', icon: '📚', color: '#fbbf24', border: '#9a7000', desc: '製造能力+1' },
        advertising: { name: '広告', icon: '📣', color: '#ef4444', border: '#8b1c1c', desc: '販売能力+2' }
    };

    let content = `
        <div style="background: linear-gradient(180deg, #f0f9ff 0%, #e0f2fe 100%); border-radius: 12px; padding: 15px; margin-bottom: 15px; border: 2px solid #0284c7;">
            <div style="text-align: center; margin-bottom: 10px;">
                <span style="font-size: 12px; color: #0369a1;">現在のチップ</span>
            </div>
            <div style="display: flex; justify-content: space-around; text-align: center;">
                <div style="background: #fff; border-radius: 8px; padding: 6px 12px; border: 2px solid ${chipInfo.research.border};">
                    <div style="font-size: 18px;">${chipInfo.research.icon}</div>
                    <div style="font-size: 14px; font-weight: bold; color: ${chipInfo.research.color};">${company.chips.research || 0}</div>
                </div>
                <div style="background: #fff; border-radius: 8px; padding: 6px 12px; border: 2px solid ${chipInfo.education.border};">
                    <div style="font-size: 18px;">${chipInfo.education.icon}</div>
                    <div style="font-size: 14px; font-weight: bold; color: ${chipInfo.education.color};">${company.chips.education || 0}</div>
                </div>
                <div style="background: #fff; border-radius: 8px; padding: 6px 12px; border: 2px solid ${chipInfo.advertising.border};">
                    <div style="font-size: 18px;">${chipInfo.advertising.icon}</div>
                    <div style="font-size: 14px; font-weight: bold; color: ${chipInfo.advertising.color};">${company.chips.advertising || 0}</div>
                </div>
            </div>
        </div>

        <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-bottom: 15px;">
            <div onclick="selectChipType('research')" id="chip-research" style="background: linear-gradient(180deg, ${chipInfo.research.color} 0%, #2e6db4 100%); border-radius: 10px; padding: 12px 8px; border: 3px solid ${chipInfo.research.border}; cursor: pointer; text-align: center; transition: all 0.2s;">
                <div style="font-size: 28px; margin-bottom: 5px;">${chipInfo.research.icon}</div>
                <div style="font-size: 12px; font-weight: bold; color: #fff;">研究</div>
                <div style="font-size: 9px; color: #bfdbfe;">${chipInfo.research.desc}</div>
            </div>
            <div onclick="selectChipType('education')" id="chip-education" style="background: linear-gradient(180deg, ${chipInfo.education.color} 0%, #d69e00 100%); border-radius: 10px; padding: 12px 8px; border: 3px solid ${chipInfo.education.border}; cursor: pointer; text-align: center; transition: all 0.2s;">
                <div style="font-size: 28px; margin-bottom: 5px;">${chipInfo.education.icon}</div>
                <div style="font-size: 12px; font-weight: bold; color: #78350f;">教育</div>
                <div style="font-size: 9px; color: #92400e;">${chipInfo.education.desc}</div>
            </div>
            <div onclick="selectChipType('advertising')" id="chip-advertising" style="background: linear-gradient(180deg, ${chipInfo.advertising.color} 0%, #c42b2b 100%); border-radius: 10px; padding: 12px 8px; border: 3px solid ${chipInfo.advertising.border}; cursor: pointer; text-align: center; transition: all 0.2s;">
                <div style="font-size: 28px; margin-bottom: 5px;">${chipInfo.advertising.icon}</div>
                <div style="font-size: 12px; font-weight: bold; color: #fff;">広告</div>
                <div style="font-size: 9px; color: #fecaca;">${chipInfo.advertising.desc}</div>
            </div>
        </div>

        <input type="hidden" id="chipType" value="${specificType || 'research'}">
    `;

    if (period >= 3) {
        // 3-5期：特急または繰り越し
        content += `
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 15px;">
            <div onclick="selectPurchaseType('express')" id="purchase-express" style="background: linear-gradient(180deg, #dc2626 0%, #b91c1c 100%); border-radius: 10px; padding: 12px; border: 3px solid #991b1b; cursor: pointer; text-align: center; transition: all 0.2s;">
                <div style="font-size: 20px; margin-bottom: 3px;">⚡</div>
                <div style="font-size: 13px; font-weight: bold; color: #fff;">特急</div>
                <div style="font-size: 11px; color: #fecaca;">¥40 / 即時使用</div>
            </div>
            <div onclick="selectPurchaseType('carryover')" id="purchase-carryover" style="background: linear-gradient(180deg, #9333ea 0%, #7c3aed 100%); border-radius: 10px; padding: 12px; border: 3px solid #6b21a8; cursor: pointer; text-align: center; transition: all 0.2s;">
                <div style="font-size: 20px; margin-bottom: 3px;">📅</div>
                <div style="font-size: 13px; font-weight: bold; color: #fff;">次期繰り越し</div>
                <div style="font-size: 11px; color: #e9d5ff;">¥20 / 次期から</div>
            </div>
        </div>
        <input type="hidden" id="purchaseType" value="express">
        `;
    }

    content += `
        <div style="margin-bottom: 15px;">
            <div style="font-size: 12px; color: #64748b; margin-bottom: 8px; text-align: center;">購入数を選択</div>
            <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px;">
                <div onclick="selectChipQty(1)" id="chipQty-1" class="qty-card" style="background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%); border: 3px solid #60a5fa; border-radius: 10px; padding: 15px; text-align: center; cursor: pointer; color: white; transition: all 0.2s;">
                    <div style="font-size: 28px; font-weight: bold;">1</div>
                    <div style="font-size: 11px; opacity: 0.9;">個</div>
                </div>
                <div onclick="selectChipQty(2)" id="chipQty-2" class="qty-card" style="background: linear-gradient(135deg, #6b7280 0%, #4b5563 100%); border: 3px solid #9ca3af; border-radius: 10px; padding: 15px; text-align: center; cursor: pointer; color: white; transition: all 0.2s;">
                    <div style="font-size: 28px; font-weight: bold;">2</div>
                    <div style="font-size: 11px; opacity: 0.9;">個</div>
                </div>
                <div onclick="selectChipQty(3)" id="chipQty-3" class="qty-card" style="background: linear-gradient(135deg, #6b7280 0%, #4b5563 100%); border: 3px solid #9ca3af; border-radius: 10px; padding: 15px; text-align: center; cursor: pointer; color: white; transition: all 0.2s;">
                    <div style="font-size: 28px; font-weight: bold;">3</div>
                    <div style="font-size: 11px; opacity: 0.9;">個</div>
                </div>
            </div>
            <input type="hidden" id="quantity" value="1">
        </div>
        <div style="background: #f1f5f9; border-radius: 10px; padding: 15px; text-align: center; margin-bottom: 15px;">
            <div style="font-size: 12px; color: #64748b;">合計金額</div>
            <div id="chipTotalCost" style="font-size: 28px; font-weight: bold; color: #dc2626;">¥${period === 2 ? 20 : 40}</div>
        </div>

        <button class="submit-btn" onclick="buyChips()" style="width: 100%;">
            🎯 購入実行
        </button>
    `;

    showModal('🎯 戦略チップ購入', content);

    // 初期選択を視覚的に反映
    setTimeout(() => {
        selectChipType(specificType || 'research');
        if (period >= 3) selectPurchaseType('express');
    }, 0);
}

// ============================================
// チップタイプ選択
// ============================================
function selectChipType(type) {
    document.getElementById('chipType').value = type;

    ['research', 'education', 'advertising'].forEach(t => {
        const el = document.getElementById(`chip-${t}`);
        if (el) {
            el.style.transform = t === type ? 'scale(1.05)' : 'scale(1)';
            el.style.boxShadow = t === type ? '0 0 20px rgba(251,191,36,0.6)' : 'none';
        }
    });
    updateChipCost();
}

// ============================================
// 購入タイプ選択（3期以降）
// ============================================
function selectPurchaseType(type) {
    document.getElementById('purchaseType').value = type;

    ['express', 'carryover'].forEach(t => {
        const el = document.getElementById(`purchase-${t}`);
        if (el) {
            el.style.transform = t === type ? 'scale(1.03)' : 'scale(1)';
            el.style.boxShadow = t === type ? '0 0 15px rgba(251,191,36,0.5)' : 'none';
        }
    });
    updateChipCost();
}

// ============================================
// チップ購入数量選択
// ============================================
function selectChipQty(qty) {
    document.getElementById('quantity').value = qty;

    [1, 2, 3].forEach(q => {
        const el = document.getElementById(`chipQty-${q}`);
        if (el) {
            if (q === qty) {
                el.style.background = 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)';
                el.style.borderColor = '#60a5fa';
                el.style.transform = 'scale(1.05)';
            } else {
                el.style.background = 'linear-gradient(135deg, #6b7280 0%, #4b5563 100%)';
                el.style.borderColor = '#9ca3af';
                el.style.transform = 'scale(1)';
            }
        }
    });
    updateChipCost();
}

// ============================================
// チップ購入金額更新
// ============================================
function updateChipCost() {
    const period = gameState.currentPeriod;
    const quantity = parseInt(document.getElementById('quantity').value) || 1;
    let unitCost = 20;

    if (period >= 3) {
        const purchaseType = document.getElementById('purchaseType');
        if (purchaseType && purchaseType.value === 'express') {
            unitCost = 40;
        }
    }

    const total = quantity * unitCost;
    document.getElementById('chipTotalCost').textContent = `¥${total}`;
}

// ============================================
// チップ購入実行
// ============================================
function buyChips() {
    const company = gameState.companies[0];
    const chipType = document.getElementById('chipType').value;
    const quantity = parseInt(document.getElementById('quantity').value);
    const period = gameState.currentPeriod;

    let cost = 0;
    let isExpress = false;

    if (period === 2) {
        // 2期：その期に使用（20円）
        cost = quantity * 20;
        isExpress = true;
    } else {
        // 3-5期：特急または繰り越し
        const purchaseType = document.getElementById('purchaseType').value;
        isExpress = purchaseType === 'express';
        cost = quantity * (isExpress ? CHIP_COSTS.express : CHIP_COSTS.normal);
    }

    // 現金チェック（短期借入で購入は不可）
    if (company.cash < cost) {
        showToast(`現金不足のため購入できません（必要: ¥${cost}、所持: ¥${company.cash}）`, 'error', 4000);
        return;
    }

    // Check max limits（教育は2期2枚、3期以降1枚 - GAME_RULES.md 5.2節）
    const educationMax = period === 2 ? 2 : 1;
    const maxLimits = {research: 5, education: educationMax, advertising: 5};
    const nextPeriodCount = company.nextPeriodChips?.[chipType] || 0;
    const currentTotal = company.chips[chipType] + nextPeriodCount + quantity;
    if (currentTotal > maxLimits[chipType]) {
        alert(`${chipType}チップは最大${maxLimits[chipType]}個までです！`);
        return;
    }

    company.cash -= cost;

    if (isExpress) {
        // 即時使用
        company.chips[chipType] += quantity;
        // F計算用トラッキング
        if (period === 2) {
            company.chipsPurchasedThisPeriod[chipType] = (company.chipsPurchasedThisPeriod[chipType] || 0) + quantity;
        } else {
            company.expressChipsPurchased[chipType] = (company.expressChipsPurchased[chipType] || 0) + quantity;
        }
    } else {
        // 次期繰り越し（次期のFになるためトラッキング不要）
        company.nextPeriodChips[chipType] += quantity;
    }

    // 行動ログ記録
    const chipNames = {research: '研究', education: '教育', advertising: '広告'};
    const typeStr = isExpress ? '特急' : '繰越';
    logAction(0, 'チップ購入', `${chipNames[chipType]}${quantity}枚(${typeStr})`, -cost, true);

    closeModal();
    updateDisplay();
    showToast(`${chipType}チップを${quantity}個購入しました（¥${cost}）`, 'success', 3000);
    endTurn();
}
