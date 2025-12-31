/**
 * MG (Management Game) - 決算・財務表示関数
 *
 * 各社の決算結果表示、PQ/VQ/F詳細、財務サマリーなど
 */

// Store financial data for reference
window.lastFinancialData = [];

// ============================================
// 決算表示
// ============================================
function showCompanySettlement(index, financialData) {
    if (index >= financialData.length) {
        // 全社表示完了、サマリーを表示
        showFinancialSummary(financialData);
        return;
    }

    const data = financialData[index];
    const company = gameState.companies[index];
    const isPlayer = index === 0;

    // PQ/VQ/MQ/G計算
    const pq = data.pq;
    const vq = data.vq;
    const mq = data.mq;
    const f = data.f;
    const g = data.g;
    const q = data.q;

    const companyEmojis = { 'あなた': '👤', 'A社': '🅰️', 'B社': '🅱️', 'C社': '©️', 'D社': '🇩', 'E社': '🇪' };
    const emoji = companyEmojis[company.name] || '🏢';

    const content = `
        <div style="padding: 20px;">
            <div style="text-align: center; margin-bottom: 20px;">
                <div style="font-size: 48px; margin-bottom: 10px;">${emoji}</div>
                <div style="font-size: 24px; font-weight: bold; color: ${isPlayer ? '#2563eb' : '#374151'};">${company.name}</div>
                <div style="font-size: 14px; color: #666;">第${gameState.currentPeriod}期 決算</div>
            </div>

            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 20px;">
                <div onclick="showPQBreakdown(${index})" style="background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%); color: white; padding: 15px; border-radius: 12px; text-align: center; cursor: pointer; transition: transform 0.2s;" onmouseover="this.style.transform='scale(1.03)'" onmouseout="this.style.transform='scale(1)'">
                    <div style="font-size: 12px; opacity: 0.8;">売上高 (PQ) <span style="font-size:10px;">▼詳細</span></div>
                    <div style="font-size: 24px; font-weight: bold;">¥${pq}</div>
                </div>
                <div onclick="showVQBreakdown(${index})" style="background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); color: white; padding: 15px; border-radius: 12px; text-align: center; cursor: pointer; transition: transform 0.2s;" onmouseover="this.style.transform='scale(1.03)'" onmouseout="this.style.transform='scale(1)'">
                    <div style="font-size: 12px; opacity: 0.8;">変動費 (VQ) <span style="font-size:10px;">▼詳細</span></div>
                    <div style="font-size: 24px; font-weight: bold;">¥${vq}</div>
                </div>
                <div style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; padding: 15px; border-radius: 12px; text-align: center;">
                    <div style="font-size: 12px; opacity: 0.8;">付加価値 (MQ)</div>
                    <div style="font-size: 24px; font-weight: bold;">¥${mq}</div>
                </div>
                <div onclick="showFBreakdown(${index})" style="background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%); color: white; padding: 15px; border-radius: 12px; text-align: center; cursor: pointer; transition: transform 0.2s;" onmouseover="this.style.transform='scale(1.03)'" onmouseout="this.style.transform='scale(1)'">
                    <div style="font-size: 12px; opacity: 0.8;">固定費 (F) <span style="font-size:10px;">▼詳細</span></div>
                    <div style="font-size: 24px; font-weight: bold;">¥${f}</div>
                </div>
            </div>

            <div style="background: ${g >= 0 ? 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)' : 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)'}; color: white; padding: 20px; border-radius: 12px; text-align: center; margin-bottom: 20px;">
                <div style="font-size: 14px; opacity: 0.9;">利益 (G = MQ - F)</div>
                <div style="font-size: 36px; font-weight: bold;">${g >= 0 ? '+' : ''}¥${g}</div>
            </div>

            <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; margin-bottom: 20px;">
                <div style="background: #f1f5f9; padding: 10px; border-radius: 8px; text-align: center;">
                    <div style="font-size: 10px; color: #64748b;">販売個数 (Q)</div>
                    <div style="font-size: 18px; font-weight: bold;">${q}個</div>
                </div>
                <div style="background: #f1f5f9; padding: 10px; border-radius: 8px; text-align: center;">
                    <div style="font-size: 10px; color: #64748b;">平均P</div>
                    <div style="font-size: 18px; font-weight: bold;">${data.p.toFixed(1)}</div>
                </div>
                <div style="background: #f1f5f9; padding: 10px; border-radius: 8px; text-align: center;">
                    <div style="font-size: 10px; color: #64748b;">平均M</div>
                    <div style="font-size: 18px; font-weight: bold;">${data.m.toFixed(1)}</div>
                </div>
            </div>

            <div style="background: #e0f2fe; padding: 15px; border-radius: 12px; margin-bottom: 20px;">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <span style="font-size: 14px; color: #0369a1;">自己資本</span>
                    <span style="font-size: 24px; font-weight: bold; color: #0369a1;">¥${company.equity}</span>
                </div>
            </div>

            <div style="text-align: center;">
                <button class="action-btn primary" onclick="showNextCompanySettlement()" style="padding: 15px 40px; font-size: 16px;">
                    ${index < financialData.length - 1 ? `次へ（${financialData[index + 1].name}）` : '全社サマリーを表示'}
                </button>
            </div>
        </div>
    `;

    showModal(`${company.name} 決算結果`, content);
}

// 次の会社の決算を表示
function showNextCompanySettlement() {
    closeModal();
    window.currentSettlementIndex++;
    showCompanySettlement(window.currentSettlementIndex, window.lastFinancialData);
}

// ============================================
// PQ（売上高）詳細表示
// ============================================
function showPQBreakdown(companyIndex) {
    const company = gameState.companies[companyIndex];
    const data = window.lastFinancialData ? window.lastFinancialData[companyIndex] : null;
    const salesLogs = (gameState.actionLog || []).filter(log =>
        log.companyIndex === companyIndex && (log.action === '商品販売' || log.action.includes('販売'))
    );

    // 保存されたPQを使用（リセット後も正しい値を表示）
    const storedPQ = data ? data.pq : (company.totalSales || 0);

    let content = '<div style="max-height: 60vh; overflow-y: auto; padding: 10px;">';
    content += '<div style="font-size: 14px; color: #1e40af; font-weight: bold; margin-bottom: 10px;">売上明細（PQ）</div>';

    if (salesLogs.length === 0) {
        content += '<p style="color: #888; text-align: center;">今期の販売記録はありません</p>';
    } else {
        let total = 0;
        salesLogs.forEach((log, idx) => {
            const revenue = log.cashChange > 0 ? log.cashChange : 0;
            total += revenue;
            content += `
                <div style="background: #f0f9ff; border: 1px solid #bae6fd; border-radius: 6px; padding: 8px; margin-bottom: 6px;">
                    <div style="display: flex; justify-content: space-between; font-size: 12px;">
                        <span style="color: #666;">${log.row}行目</span>
                        <span style="font-weight: bold; color: #22c55e;">+¥${revenue}</span>
                    </div>
                    <div style="font-size: 11px; color: #1e293b; margin-top: 4px;">${log.details}</div>
                </div>
            `;
        });
        // ログ合計と保存されたPQが異なる場合は両方表示
        if (total !== storedPQ && storedPQ > 0) {
            content += `<div style="background: #fef3c7; border: 1px solid #f59e0b; padding: 8px; border-radius: 6px; margin-top: 10px; font-size: 11px; color: #92400e;">
                ※ログ集計: ¥${total}（一部取引がログに記録されていない可能性があります）
            </div>`;
        }
    }

    content += `<div style="background: #1e40af; color: white; padding: 10px; border-radius: 8px; text-align: center; margin-top: 10px;">
        <div style="font-size: 12px;">売上高合計 (PQ)</div>
        <div style="font-size: 20px; font-weight: bold;">¥${storedPQ}</div>
    </div>`;
    content += '</div>';
    content += `<div style="text-align: center; margin-top: 10px;">
        <button onclick="closeBreakdownModal()" class="btn-primary" style="padding: 8px 20px;">閉じる</button>
    </div>`;

    showBreakdownModal(`${company.name} - PQ詳細`, content);
}

// ============================================
// VQ（変動費）詳細表示
// ============================================
function showVQBreakdown(companyIndex) {
    const company = gameState.companies[companyIndex];
    const data = window.lastFinancialData ? window.lastFinancialData[companyIndex] : null;

    // 保存されたデータがあれば使用（リセット後も正しい値を表示）
    const materialCost = data ? data.materialCost : (company.totalMaterialCost || 0);
    const productionCost = data ? data.productionCost : (company.totalProductionCost || 0);
    const startInv = data ? data.startInventory : (company.periodStartInventory || {materials: 0, wip: 0, products: 0});
    const endInv = data ? data.endInventory : {materials: company.materials, wip: company.wip, products: company.products};
    const startValue = (startInv.materials * 13) + (startInv.wip * 14) + (startInv.products * 15);
    const endValue = (endInv.materials * 13) + (endInv.wip * 14) + (endInv.products * 15);

    let content = '<div style="max-height: 60vh; overflow-y: auto; padding: 10px;">';
    content += '<div style="font-size: 14px; color: #d97706; font-weight: bold; margin-bottom: 10px;">変動費明細（VQ）</div>';

    // 材料購入明細
    const purchaseLogs = (gameState.actionLog || []).filter(log =>
        log.companyIndex === companyIndex && log.action === '材料購入'
    );
    content += '<div style="margin-bottom: 15px;">';
    content += '<div style="font-size: 12px; color: #666; font-weight: bold; margin-bottom: 5px;">材料購入</div>';
    if (purchaseLogs.length === 0) {
        content += '<div style="font-size: 11px; color: #888;">記録なし</div>';
    } else {
        purchaseLogs.forEach(log => {
            const cost = Math.abs(log.cashChange);
            content += `<div style="display: flex; justify-content: space-between; font-size: 11px; padding: 4px 0; border-bottom: 1px solid #e5e7eb;">
                <span>${log.row}行目: ${log.details}</span>
                <span style="color: #ef4444;">¥${cost}</span>
            </div>`;
        });
    }
    content += `<div style="font-weight: bold; text-align: right; font-size: 12px; margin-top: 5px;">小計: ¥${materialCost}</div>`;
    content += '</div>';

    // 製造費明細
    const prodLogs = (gameState.actionLog || []).filter(log =>
        log.companyIndex === companyIndex && (log.action === '完成・投入' || log.action.includes('完成'))
    );
    content += '<div style="margin-bottom: 15px;">';
    content += '<div style="font-size: 12px; color: #666; font-weight: bold; margin-bottom: 5px;">製造費（加工費）</div>';
    if (prodLogs.length === 0) {
        content += '<div style="font-size: 11px; color: #888;">記録なし</div>';
    } else {
        prodLogs.forEach(log => {
            const cost = Math.abs(log.cashChange);
            content += `<div style="display: flex; justify-content: space-between; font-size: 11px; padding: 4px 0; border-bottom: 1px solid #e5e7eb;">
                <span>${log.row}行目: ${log.details}</span>
                <span style="color: #ef4444;">¥${cost}</span>
            </div>`;
        });
    }
    content += `<div style="font-weight: bold; text-align: right; font-size: 12px; margin-top: 5px;">小計: ¥${productionCost}</div>`;
    content += '</div>';

    // 在庫評価
    content += '<div style="margin-bottom: 15px;">';
    content += '<div style="font-size: 12px; color: #666; font-weight: bold; margin-bottom: 5px;">在庫評価差額</div>';
    content += `<div style="font-size: 11px; display: flex; justify-content: space-between; padding: 4px 0;">
        <span>期首在庫評価額（材${startInv.materials}×13 + 仕${startInv.wip}×14 + 製${startInv.products}×15）</span>
        <span>+¥${startValue}</span>
    </div>`;
    content += `<div style="font-size: 11px; display: flex; justify-content: space-between; padding: 4px 0;">
        <span>期末在庫評価額（材${endInv.materials}×13 + 仕${endInv.wip}×14 + 製${endInv.products}×15）</span>
        <span>-¥${endValue}</span>
    </div>`;
    content += '</div>';

    const vq = data ? data.vq : (materialCost + productionCost + startValue - endValue);
    content += `<div style="background: #f59e0b; color: white; padding: 10px; border-radius: 8px; text-align: center; margin-top: 10px;">
        <div style="font-size: 12px;">変動費合計 (VQ)</div>
        <div style="font-size: 20px; font-weight: bold;">¥${vq}</div>
        <div style="font-size: 10px; opacity: 0.9;">= 材料${materialCost} + 製造${productionCost} + 期首${startValue} - 期末${endValue}</div>
    </div>`;
    content += '</div>';
    content += `<div style="text-align: center; margin-top: 10px;">
        <button onclick="closeBreakdownModal()" class="btn-primary" style="padding: 8px 20px;">閉じる</button>
    </div>`;

    showBreakdownModal(`${company.name} - VQ詳細`, content);
}

// ============================================
// F（固定費）詳細表示
// ============================================
function showFBreakdown(companyIndex) {
    const company = gameState.companies[companyIndex];
    const data = window.lastFinancialData ? window.lastFinancialData[companyIndex] : null;
    const fb = data?.fBreakdown;

    // 保存されたデータがあれば使用（リセット後も正しい値を表示）
    const period = fb ? fb.period : gameState.currentPeriod;
    const unitCost = fb ? fb.unitCost : (BASE_SALARY_BY_PERIOD[period] || 22);
    const halfCost = fb ? fb.halfCost : Math.round(unitCost / 2);

    // 給与計算
    const stats = fb ? fb.stats : (company.endOfPeriodStats || {
        machines: company.machines.length,
        workers: company.workers,
        salesmen: company.salesmen
    });
    const machineSalary = fb ? fb.machineSalary : (stats.machines * unitCost);
    const workerSalary = fb ? fb.workerSalary : (stats.workers * unitCost);
    const salesmenSalary = fb ? fb.salesmenSalary : (stats.salesmen * unitCost);
    const maxPersonnel = fb ? fb.maxPersonnel : (company.maxPersonnel || (stats.workers + stats.salesmen));
    const maxPersonnelCost = fb ? fb.maxPersonnelCost : (maxPersonnel * halfCost);
    const totalSalary = fb ? fb.totalSalary : (machineSalary + workerSalary + salesmenSalary + maxPersonnelCost);

    // 減価償却
    const depreciation = fb ? fb.depreciation : calculateDepreciation(company, period);

    // 金利
    const longInterest = fb ? fb.longInterest : Math.floor((company.loans || 0) * 0.1);
    const shortInterest = fb ? fb.shortInterest : Math.floor((company.shortLoans || 0) * 0.2);

    // チップ費用
    const pcCost = fb ? fb.pcCost : ((company.chips.computer || 0) * 20);
    const insuranceCost = fb ? fb.insuranceCost : ((company.chips.insurance || 0) * 5);

    let chipCost = 0;
    if (fb) {
        chipCost = fb.chipCost;
    } else if (period === 2) {
        const purchased = company.chipsPurchasedThisPeriod || {research: 0, education: 0, advertising: 0};
        const chipsAtEnd = {
            research: company.chips.research || 0,
            education: company.chips.education || 0,
            advertising: company.chips.advertising || 0
        };
        const willCarryOver = {
            research: Math.max(0, Math.min(chipsAtEnd.research, 3) - 1),
            education: Math.max(0, Math.min(chipsAtEnd.education, 3) - 1),
            advertising: Math.max(0, Math.min(chipsAtEnd.advertising, 3) - 1)
        };
        chipCost = (Math.max(0, (purchased.research || 0) - willCarryOver.research) +
                    Math.max(0, (purchased.education || 0) - willCarryOver.education) +
                    Math.max(0, (purchased.advertising || 0) - willCarryOver.advertising)) * 20;
    } else {
        const carriedOver = company.carriedOverChips || {research: 0, education: 0, advertising: 0};
        const express = company.expressChipsPurchased || {research: 0, education: 0, advertising: 0};
        chipCost = ((carriedOver.research || 0) + (carriedOver.education || 0) + (carriedOver.advertising || 0)) * 20;
        chipCost += ((express.research || 0) + (express.education || 0) + (express.advertising || 0)) * 40;
    }

    const extraLabor = fb ? fb.extraLabor : (company.extraLaborCost || 0);
    const additionalF = fb ? fb.additionalF : (company.additionalFixedCost || 0);

    const totalF = data ? data.f : (totalSalary + depreciation + longInterest + shortInterest + pcCost + insuranceCost + chipCost + extraLabor + additionalF);

    let content = '<div style="max-height: 60vh; overflow-y: auto; padding: 10px;">';
    content += '<div style="font-size: 14px; color: #4f46e5; font-weight: bold; margin-bottom: 10px;">固定費明細（F）</div>';

    // 給与
    content += '<div style="margin-bottom: 15px; background: #f1f5f9; padding: 10px; border-radius: 8px;">';
    content += '<div style="font-size: 12px; color: #374151; font-weight: bold; margin-bottom: 5px;">給与・人件費</div>';
    content += `<div style="font-size: 11px; display: flex; justify-content: space-between; padding: 3px 0;">
        <span>機械（${stats.machines}台×¥${unitCost}）</span><span>¥${machineSalary}</span>
    </div>`;
    content += `<div style="font-size: 11px; display: flex; justify-content: space-between; padding: 3px 0;">
        <span>ワーカー（${stats.workers}人×¥${unitCost}）</span><span>¥${workerSalary}</span>
    </div>`;
    content += `<div style="font-size: 11px; display: flex; justify-content: space-between; padding: 3px 0;">
        <span>セールス（${stats.salesmen}人×¥${unitCost}）</span><span>¥${salesmenSalary}</span>
    </div>`;
    content += `<div style="font-size: 11px; display: flex; justify-content: space-between; padding: 3px 0;">
        <span>期中最大（${maxPersonnel}人×¥${halfCost}）</span><span>¥${maxPersonnelCost}</span>
    </div>`;
    content += `<div style="font-weight: bold; text-align: right; font-size: 12px; margin-top: 5px; border-top: 1px solid #cbd5e1; padding-top: 5px;">給与計: ¥${totalSalary}</div>`;
    content += '</div>';

    // 減価償却
    content += `<div style="font-size: 11px; display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #e5e7eb;">
        <span>減価償却費</span><span>¥${depreciation}</span>
    </div>`;

    // 金利
    if (longInterest > 0 || shortInterest > 0) {
        content += `<div style="font-size: 11px; display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #e5e7eb;">
            <span>借入金利（長期10%: ¥${longInterest} + 短期20%: ¥${shortInterest}）</span><span>¥${longInterest + shortInterest}</span>
        </div>`;
    }

    // チップ
    if (pcCost > 0 || insuranceCost > 0 || chipCost > 0) {
        content += '<div style="font-size: 11px; padding: 8px 0; border-bottom: 1px solid #e5e7eb;">';
        content += '<div style="display: flex; justify-content: space-between;"><span>チップ費用</span><span></span></div>';
        if (pcCost > 0) content += `<div style="padding-left: 10px; color: #666;">　PC: ¥${pcCost}</div>`;
        if (insuranceCost > 0) content += `<div style="padding-left: 10px; color: #666;">　保険: ¥${insuranceCost}</div>`;
        if (chipCost > 0) content += `<div style="padding-left: 10px; color: #666;">　戦略チップ: ¥${chipCost}</div>`;
        content += '</div>';
    }

    // その他
    if (extraLabor > 0) {
        content += `<div style="font-size: 11px; display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #e5e7eb;">
            <span>その他人件費</span><span>¥${extraLabor}</span>
        </div>`;
    }
    if (additionalF > 0) {
        content += `<div style="font-size: 11px; display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #e5e7eb;">
            <span>追加費用（短期借入手数料等）</span><span>¥${additionalF}</span>
        </div>`;
    }

    content += `<div style="background: #4f46e5; color: white; padding: 10px; border-radius: 8px; text-align: center; margin-top: 15px;">
        <div style="font-size: 12px;">固定費合計 (F)</div>
        <div style="font-size: 20px; font-weight: bold;">¥${totalF}</div>
    </div>`;
    content += '</div>';
    content += `<div style="text-align: center; margin-top: 10px;">
        <button onclick="closeBreakdownModal()" class="btn-primary" style="padding: 8px 20px;">閉じる</button>
    </div>`;

    showBreakdownModal(`${company.name} - F詳細`, content);
}

// ============================================
// 詳細モーダル表示用ヘルパー関数
// ============================================
function showBreakdownModal(title, content) {
    const modalHtml = `
        <div class="modal active" id="breakdownModal" onclick="if(event.target === this) closeBreakdownModal()">
            <div class="modal-content" style="max-width: 450px; max-height: 80vh;">
                <div class="modal-header" style="background: #1e293b; color: white;">
                    <h3 class="modal-title">${title}</h3>
                    <button class="close-btn" onclick="closeBreakdownModal()" style="color: white;">✕</button>
                </div>
                <div class="modal-body" style="padding: 0;">
                    ${content}
                </div>
            </div>
        </div>
    `;
    const container = document.createElement('div');
    container.id = 'breakdownModalContainer';
    container.innerHTML = modalHtml;
    document.body.appendChild(container);
}

function closeBreakdownModal() {
    const container = document.getElementById('breakdownModalContainer');
    if (container) container.remove();
}

// ============================================
// 財務サマリー表示（横軸：メンバー、縦軸：項目）
// ============================================
function showFinancialSummary(financialData) {
    // 各社の自己資本を取得
    const equities = gameState.companies.map(c => c.equity);

    // 項目定義（縦軸）
    const items = [
        { key: 'equity', label: '自己資本', format: v => `¥${v}` },
        { key: 'p', label: '平均P', format: v => v.toFixed(1) },
        { key: 'v', label: '平均V', format: v => v.toFixed(1) },
        { key: 'm', label: '平均M', format: v => v.toFixed(1) },
        { key: 'q', label: 'Q', format: v => v },
        { key: 'pq', label: 'PQ', format: v => `¥${v}` },
        { key: 'vq', label: 'VQ', format: v => `¥${v}` },
        { key: 'mq', label: 'MQ', format: v => `¥${v}` },
        { key: 'f', label: 'F', format: v => `¥${v}` },
        { key: 'g', label: 'G', format: v => `¥${v}`, highlight: true }
    ];

    // ヘッダー行（会社名）
    let html = `
        <div style="overflow-x: auto;">
            <table style="width: 100%; border-collapse: collapse; font-size: 11px;">
                <thead>
                    <tr style="background: #1e40af; color: white;">
                        <th style="border: 1px solid #3b82f6; padding: 6px; text-align: left;">項目</th>
    `;

    financialData.forEach((data, index) => {
        const isPlayer = index === 0;
        html += `<th style="border: 1px solid #3b82f6; padding: 6px; text-align: center; background: ${isPlayer ? '#2563eb' : '#1e40af'}; min-width: 60px;">${data.name.replace('社', '')}</th>`;
    });
    html += '</tr></thead><tbody>';

    // 各項目の行を生成
    items.forEach(item => {
        html += `<tr>
            <td style="border: 1px solid #dee2e6; padding: 6px; background: #f1f5f9; font-weight: bold;">${item.label}</td>`;

        financialData.forEach((data, index) => {
            const isPlayer = index === 0;
            let value;
            if (item.key === 'equity') {
                value = equities[index];
            } else {
                value = data[item.key];
            }

            const formatted = item.format(value);
            let style = `border: 1px solid #dee2e6; padding: 6px; text-align: right;`;
            if (isPlayer) style += ' background: #e0f2fe;';
            if (item.highlight) {
                style += value >= 0 ? ' color: #16a34a; font-weight: bold;' : ' color: #dc2626; font-weight: bold;';
            }

            html += `<td style="${style}">${formatted}</td>`;
        });
        html += '</tr>';
    });

    html += `
                </tbody>
            </table>
        </div>
        <div style="margin-top: 10px; font-size: 10px; color: #666;">
            <p>平均P = PQ÷Q、平均V = VQ÷Q、平均M = MQ÷Q</p>
            <p>MQ = PQ - VQ、G = MQ - F</p>
        </div>
    `;

    // チップ返却情報を表示（2期末の場合のみ詳細表示）
    if (financialData[0]?.chipsBefore) {
        html += `
            <div style="margin-top: 15px; background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%); border-radius: 12px; padding: 15px; border: 1px solid #f59e0b;">
                <div style="font-weight: bold; color: #92400e; margin-bottom: 10px; display: flex; align-items: center; gap: 5px;">
                    <span style="font-size: 16px;">🎫</span> チップ返却・繰越
                </div>
                <div style="font-size: 11px; color: #78350f; margin-bottom: 10px;">
                    ${gameState.currentPeriod === 2
                        ? 'コンピュータ・保険は返却。研究・教育・広告は1枚減って次期へ繰越（最大3枚）'
                        : '期末で全チップ返却。次期予約チップのみ繰越'}
                </div>
                <div style="display: grid; grid-template-columns: repeat(${financialData.length}, 1fr); gap: 8px; font-size: 10px;">
        `;

        financialData.forEach((data, index) => {
            const before = data.chipsBefore || {};
            const after = data.chipsAfter || {};
            const nextBefore = data.nextPeriodChipsBefore || {};
            const isPlayer = index === 0;

            // 繰越チップ数の計算（次期開始時点で持っているチップ）
            const carryoverTotal = (after.research || 0) + (after.education || 0) + (after.advertising || 0);

            html += `
                <div style="background: ${isPlayer ? '#dbeafe' : 'white'}; border-radius: 8px; padding: 8px; text-align: center;">
                    <div style="font-weight: bold; color: ${isPlayer ? '#1e40af' : '#374151'}; margin-bottom: 5px;">${data.name.replace('社', '')}</div>
                    <div style="font-size: 9px; color: #666;">
                        <div>研: ${before.research || 0}→${after.research || 0}</div>
                        <div>教: ${before.education || 0}→${after.education || 0}</div>
                        <div>広: ${before.advertising || 0}→${after.advertising || 0}</div>
                    </div>
                    <div style="margin-top: 5px; padding-top: 5px; border-top: 1px dashed #ccc; font-weight: bold; color: ${carryoverTotal > 0 ? '#16a34a' : '#6b7280'};">
                        繰越: ${carryoverTotal}枚
                    </div>
                </div>
            `;
        });

        html += `
                </div>
            </div>
        `;
    }

    html += `
        <div style="display: flex; gap: 10px; margin-top: 15px;">
            <button class="cancel-btn" onclick="showActionLogModal()" style="flex: 1;">行動ログを見る</button>
            <button class="submit-btn" onclick="closeModal(); proceedToNextPeriod();" style="flex: 1;">次期へ進む</button>
        </div>
    `;

    showModal(`第${gameState.currentPeriod}期 決算結果`, html);
}

// ============================================
// 財務詳細表示
// ============================================
function showFinancialDetails(companyIndex) {
    // まず保存されたfinancialDataがあればそれを使う（リセット後でも正しいデータ）
    const savedData = window.lastFinancialData && window.lastFinancialData[companyIndex];
    const company = gameState.companies[companyIndex];

    // savedDataがあればそれを優先（期末処理後でも正しい値）
    const pq = savedData ? savedData.pq : company.totalSales;
    const vq = savedData ? savedData.vq : calculateVQ(company);
    const mq = savedData ? savedData.mq : (pq - vq);
    const fixedCosts = savedData ? savedData.f : calculateFixedCost(company);
    const g = savedData ? savedData.g : (mq - fixedCosts - (company.specialLoss || 0));

    // Q = 販売個数
    const q = savedData ? savedData.q : (company.totalSoldQuantity || 0);

    // 在庫数量（現在の値を使用 - 期末在庫として表示）
    const inventoryP = company.products || 0;
    const inventoryV = company.wip || 0;
    const inventoryM = company.materials || 0;

    // VQの詳細計算用（savedDataがない場合のフォールバック）
    const materialCost = savedData ? (savedData.materialCost || 0) : (company.totalMaterialCost || 0);
    const productionCost = savedData ? (savedData.productionCost || 0) : (company.totalProductionCost || 0);
    const endInventoryValue = (inventoryM * 13) + (inventoryV * 14) + (inventoryP * 15);

    // 期首在庫は決算時に更新されるため、savedDataに保存されていればそれを使う
    const startMat = savedData ? (savedData.startInventory?.materials || 0) : (company.periodStartInventory?.materials || 0);
    const startWip = savedData ? (savedData.startInventory?.wip || 0) : (company.periodStartInventory?.wip || 0);
    const startProd = savedData ? (savedData.startInventory?.products || 0) : (company.periodStartInventory?.products || 0);
    const startInventoryValue = (startMat * 13) + (startWip * 14) + (startProd * 15);

    let html = `
        <div class="breakdown-list" style="max-height: 500px; overflow-y: auto;">
            <h3>${company.name}の財務詳細</h3>

            <div class="breakdown-item breakdown-total"><span>【PQ：売上高】</span><span>¥${pq}</span></div>
            <div class="breakdown-item" style="font-size: 11px;"><span>　期中売上累計</span><span>¥${pq}</span></div>

            <div class="breakdown-item breakdown-total"><span>【VQ：変動費総額】</span><span>¥${vq}</span></div>
            <div class="breakdown-item" style="font-size: 11px;"><span>　①材料購入費</span><span>¥${materialCost}</span></div>
            <div class="breakdown-item" style="font-size: 11px;"><span>　②完成投入費</span><span>¥${productionCost}</span></div>
            <div class="breakdown-item" style="font-size: 11px;"><span>　③期首在庫評価額</span><span>¥${startInventoryValue}</span></div>
            <div class="breakdown-item" style="font-size: 11px; color: #666;"><span>　　(材${startMat}×13 + 仕${startWip}×14 + 製${startProd}×15)</span><span></span></div>
            <div class="breakdown-item" style="font-size: 11px;"><span>　④期末在庫評価額</span><span>-¥${endInventoryValue}</span></div>
            <div class="breakdown-item" style="font-size: 11px; color: #666;"><span>　　(材${inventoryM}×13 + 仕${inventoryV}×14 + 製${inventoryP}×15)</span><span></span></div>
            <div class="breakdown-item" style="font-size: 11px; color: #28a745;"><span>　VQ = ①+②+③-④</span><span>¥${vq}</span></div>

            <div class="breakdown-item breakdown-total"><span>【MQ：付加価値総額】</span><span>¥${mq}</span></div>
            <div class="breakdown-item" style="font-size: 11px; color: #28a745;"><span>　MQ = PQ - VQ</span><span>¥${pq} - ¥${vq}</span></div>

            <div class="breakdown-item breakdown-total"><span>【F】</span><span>¥${fixedCosts}</span></div>
            <div class="breakdown-item" style="font-size: 11px;"><span>　給料</span><span>¥${calculateSalaryCost(company, gameState.currentPeriod)}</span></div>
            <div class="breakdown-item" style="font-size: 11px;"><span>　チップ費用</span><span>¥${calculateChipCost(company, gameState.currentPeriod)}</span></div>
            <div class="breakdown-item" style="font-size: 11px;"><span>　減価償却費</span><span>¥${calculateDepreciation(company, gameState.currentPeriod)}</span></div>
            ${company.additionalFixedCost ? `<div class="breakdown-item" style="font-size: 11px;"><span>　リスクカード費用</span><span>¥${company.additionalFixedCost}</span></div>` : ''}
            ${company.extraLaborCost ? `<div class="breakdown-item" style="font-size: 11px;"><span>　その他人件費</span><span>¥${company.extraLaborCost}</span></div>` : ''}
            ${company.specialLoss ? `<div class="breakdown-item" style="font-size: 11px;"><span>　特別損失</span><span>¥${company.specialLoss}</span></div>` : ''}

            <div class="breakdown-item breakdown-total"><span>【G：利益】</span><span style="color: ${g >= 0 ? '#28a745' : '#dc3545'}">¥${g}</span></div>
            <div class="breakdown-item" style="font-size: 11px; color: #28a745;"><span>　G = MQ - F</span><span>¥${mq} - ¥${fixedCosts}</span></div>

            <div class="breakdown-item breakdown-total"><span>【Q：販売個数】</span><span>${company.totalSoldQuantity || 0}個</span></div>

            <div class="breakdown-item breakdown-total"><span>【期末在庫】</span><span></span></div>
            <div class="breakdown-item" style="font-size: 11px;"><span>　材料</span><span>${inventoryM}個</span></div>
            <div class="breakdown-item" style="font-size: 11px;"><span>　仕掛品</span><span>${inventoryV}個</span></div>
            <div class="breakdown-item" style="font-size: 11px;"><span>　製品</span><span>${inventoryP}個</span></div>

            <div class="breakdown-item breakdown-total"><span>【単価計算】</span><span></span></div>
            <div class="breakdown-item" style="font-size: 11px;"><span>　P = PQ÷Q</span><span>¥${pq}÷${q} = ${q > 0 ? (pq/q).toFixed(1) : '―'}</span></div>
            <div class="breakdown-item" style="font-size: 11px;"><span>　V = VQ÷Q</span><span>¥${vq}÷${q} = ${q > 0 ? (vq/q).toFixed(1) : '―'}</span></div>
            <div class="breakdown-item" style="font-size: 11px;"><span>　M = MQ÷Q</span><span>¥${mq}÷${q} = ${q > 0 ? (mq/q).toFixed(1) : '―'}</span></div>
        </div>
        <button class="submit-btn" onclick="closeModal();" style="margin-top: 10px;">閉じる</button>
    `;

    showModal(`${company.name}の財務詳細`, html);
}
