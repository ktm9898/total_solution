import re

with open('index.html', 'r', encoding='utf-8') as f:
    idx_content = f.read()

with open('admin.html', 'r', encoding='utf-8') as f:
    adm_content = f.read()

# Extract index.html CSS
idx_css_start = idx_content.find('        .print-only {')
idx_css_end = idx_content.find('        .ai-text-header {', idx_css_start)
idx_css = idx_content[idx_css_start:idx_css_end]

# Extract index.html Survey Form HTML
# This is tricky because it's JSX. 
# Better to manually provide the updated printSurvey string that renders identical HTML.
# Instead of parsing index.html JSX, I will build out the printSurvey innerHTML to match index.html exact DOM.

# Let's read admin.html and replace its CSS first.
adm_css_start = adm_content.find('        /* ======================== */\n        /* 인쇄 전용 CSS')
adm_css_end = adm_content.find('        .ai-text-header {', adm_css_start)

adm_content = adm_content[:adm_css_start] + idx_css + adm_content[adm_css_end:]

# Now replace printSurvey in admin.html
# Find start of printSurvey
func_start = adm_content.find('            // 설문지 인쇄 (index.html 폼 구조 100% 동일)')
func_end = adm_content.find('            const AdminApp = () => {', func_start)

# We want to replace everything from func_start to the end of printSurvey
# Actually, func_end is '            const AdminApp'. Wait, printSurvey is inside AdminApp.
# Let's find 'const printSurvey = (record) => {'
func_start = adm_content.find('            const printSurvey = (record) => {')
func_end = adm_content.find('            // 데이터 로드', func_start)

new_print_survey = r"""            const printSurvey = (record) => {
                const printArea = document.getElementById('print-area');
                let surveyObj = {};
                try { surveyObj = JSON.parse(record.surveyData || '{}'); } catch { }

                const questions = ["우리 동네 상권분석 데이터와 현재 트렌드가 궁금하다.", "쿠폰 발행, 이벤트 기획 등 구체적인 판촉 방법을 알고 싶다.", "인스타그램, 블로그 등 SNS 홍보를 잘하고 싶다.", "배달 앱이나 포털의 리뷰 및 평점 관리 방법을 배우고 싶다.", "고객 트렌드에 맞는 신메뉴나 신상품 개발을 도움받고 싶다.", "분위기 쇄신을 위한 매장 연출(VMD) 개선이 필요하다.", "우리 가게의 로고, 메뉴판 등 디자인을 개선하고 싶다.", "키오스크, 서빙로봇 등 디지털 기술 도입을 희망한다.", "임대료 인상이나 재계약 관련 법률 검토가 필요하다.", "직원 근로계약서, 주휴수당 등 노무 규정 도움이 필요하다.", "부가세, 소득세 신고 시 활용 가능한 절세 팁을 배우고 싶다."];
                const scores = surveyObj.scores || Array(11).fill(0);
                const benefits = surveyObj.benefits || {};
                const notes = surveyObj.notes || '';

                const benefitLabels = [
                    { key: 'jobIncrease', label: '상시근로자 고용 증가' },
                    { key: 'jobCreation', label: '일자리 창출(청년, 여성, 고령자, 장애인 고용)' },
                    { key: 'intellectualProperty', label: '지식재산권(특허, 실용신안) 보유' },
                    { key: 'socialInsurance', label: '사회보험 가입(1인 자영업자 고용보험 포함)' },
                    { key: 'lowIncome', label: '저소득(연 59백만원 이하)' },
                    { key: 'socialCare', label: '사회적배려(실직자, 장애인, 여성가장, 한부모·다둥이·다문화가정)' },
                    { key: 'smallBusiness', label: '영세자영업(간이과세자)' },
                    { key: 'revenueDecrease', label: '매출감소(직전 분기·반기 대비 신고매출액 20% 이상 감소)' }
                ];

                const categories = [
                    { name: '홍보·마케팅', startIdx: 0, count: 4 },
                    { name: '매장 운영·관리', startIdx: 4, count: 4 },
                    { name: '법률·노무·세무', startIdx: 8, count: 3 }
                ];

                // 테이블 행 생성
                let tableRows = '';
                categories.forEach(cat => {
                    for (let qIdx = 0; qIdx < cat.count; qIdx++) {
                        const globalIdx = cat.startIdx + qIdx;
                        const q = questions[globalIdx];
                        let catCell = '';
                        if (qIdx === 0) {
                            catCell = `<td rowspan="${cat.count}" class="p-4 align-middle font-black text-sm text-[#0055A5] border-r border-slate-100 bg-slate-50/20 text-center text-center-print whitespace-pre-wrap">${cat.name === '매장 운영·관리' ? '매장 운영·<br class="screen-only" />관리' : cat.name === '법률·노무·세무' ? '법률·노무·<br class="screen-only" />세무' : cat.name}</td>`;
                        }
                        const scoreCells = [1, 2, 3, 4].map(s => {
                            const isSelected = scores[globalIdx] === s;
                            return `<td class="p-4 text-center">
                                <button class="w-9 h-9 rounded-sm border transition-all text-sm font-black ${isSelected ? 'bg-[#0055A5] border-[#0055A5] text-white shadow-md' : 'bg-white border-slate-200 text-slate-300 hover:border-slate-400 hover:text-slate-500'}">${s}</button>
                            </td>`;
                        }).join('');
                        tableRows += `<tr class="border-b border-slate-100 hover:bg-slate-50/30 transition-colors">${catCell}<td class="p-4 text-base text-slate-700 font-medium leading-snug text-center-print">${q}</td>${scoreCells}</tr>`;
                    }
                });

                // 우대사항 그리드 (체크박스)
                const benefitGrid = benefitLabels.map(item => {
                    const checked = benefits[item.key];
                    return `<label class="flex items-start gap-3 px-4 py-2.5 rounded-sm border transition-all cursor-pointer group ${checked ? 'bg-blue-50 border-blue-200' : 'bg-white border-slate-100 hover:bg-slate-50'}">
                        <input type="checkbox" ${checked ? 'checked' : ''} disabled class="mt-0.5 w-5 h-5 accent-[#0055A5]" />
                        <span class="text-sm font-bold leading-tight group-hover:text-slate-900 transition-colors">
                            <span class="${checked ? 'text-[#0055A5]' : 'text-slate-600'} screen-only">${item.label}</span>
                            <span class="${checked ? 'text-[#0055A5]' : 'text-slate-600'} print-only">${item.label.split('(')[0].trim()}</span>
                        </span>
                    </label>`;
                }).join('');

                printArea.className = '';
                printArea.innerHTML = `
                    <div class="min-h-screen py-8 px-4 relative">
                        <div class="max-w-5xl mx-auto bg-white shadow-2xl border border-slate-200 overflow-hidden print-container rounded-sm">
                            <div class="p-10 border-b border-slate-100 bg-white relative">
                                <div class="flex justify-between items-start">
                                    <div>
                                        <div class="flex items-center gap-2 mb-2">
                                            <span class="text-xs font-bold text-slate-400 tracking-tighter uppercase italic">Seoul Credit Guarantee Foundation</span>
                                        </div>
                                        <h1 class="text-4xl font-black text-slate-900 tracking-tight leading-none mb-2">소상공인 종합지원을 위한 자가진단</h1>
                                        <p class="text-sm text-slate-500 font-medium">우리 가게 맞춤형 지원사업 매칭을 위한 기초 리포트</p>
                                    </div>
                                    <div class="text-right"><p class="text-xl font-black text-[#0055A5] leading-tight mb-1">내일을 꿈꾸는 사장님께</p><p class="text-sm font-bold text-slate-400">서울신용보증재단 용산종합지원센터</p></div>
                                </div>
                            </div>
                            
                            <div class="p-10 space-y-12">
                                <!-- 1. 기본정보 -->
                                <section>
                                    <div class="flex items-center gap-2 mb-4">
                                        <div class="w-1.5 h-6 bg-[#0055A5]"></div>
                                        <h2 class="text-xl font-black text-slate-800 uppercase tracking-tight flex items-center">
                                            1. 기본정보
                                            <span class="text-lg text-slate-400 ml-1 font-extrabold flex items-center">
                                                ( <input type="text" readonly class="w-[4.8rem] bg-transparent border-b-2 border-slate-300 outline-none text-lg font-bold text-[#0055A5] text-center mx-1 print:border-none print:p-0" value="${record.businessNumber || ''}" /> )
                                            </span>
                                        </h2>
                                    </div>
                                    <div class="info-grid grid grid-cols-1 md:grid-cols-3 gap-y-5 gap-x-8">
                                        <div class="space-y-1.5"><label class="text-sm font-black text-slate-500 ml-1">출생년도</label><select class="w-full p-3 bg-slate-50 border border-slate-200 rounded-sm outline-none text-base font-bold"><option>${record.birthYear || '-'}년</option></select></div>
                                        <div class="space-y-1.5"><label class="text-sm font-black text-slate-500 ml-1">NICE CB점수</label><input type="number" readonly class="w-full p-3 bg-slate-50 border border-slate-200 rounded-sm outline-none text-base font-bold" value="${record.niceScore || '0'}" /></div>
                                        <div class="space-y-1.5"><label class="text-sm font-black text-slate-500 ml-1">기보증금액 (만원)</label><input type="number" readonly class="w-full p-3 bg-slate-50 border border-slate-200 rounded-sm outline-none text-base font-bold" value="${record.guaranteedAmount || '0'}" /></div>
                                        <div class="space-y-1.5"><label class="text-sm font-black text-slate-500 ml-1">설립일자</label><input type="date" readonly class="w-full p-3 bg-slate-50 border border-slate-200 rounded-sm outline-none text-base font-bold" value="${record.foundationDate || '-'}" /></div>
                                        <div class="space-y-1.5"><label class="text-sm font-black text-slate-500 ml-1">업종</label><input type="text" readonly class="w-full p-3 bg-slate-50 border border-slate-200 rounded-sm outline-none text-base font-bold" value="${record.sector || '-'}" /></div>
                                        <div class="space-y-1.5"><label class="text-sm font-black text-slate-500 ml-1">종업원수 (명)</label><input type="number" readonly class="w-full p-3 bg-slate-50 border border-slate-200 rounded-sm outline-none text-base font-bold" value="${record.employeeCount || '0'}" /></div>
                                    </div>
                                    <div class="revenue-box mt-8 flex flex-wrap items-center gap-10 p-5 bg-slate-50 rounded-sm border border-slate-100">
                                        <div class="flex items-center gap-4">
                                            <span class="text-sm font-black text-slate-500 uppercase tracking-tighter">매출현황 :</span>
                                            <div class="flex items-center gap-2">
                                                <input type="number" readonly class="w-40 p-2.5 bg-white border border-slate-200 rounded-sm outline-none text-base font-bold text-right" value="${record.annualSales || ''}" />
                                                <span class="text-xs font-bold text-slate-500">만원/년</span>
                                            </div>
                                        </div>
                                        <div class="flex items-center gap-5">
                                            ${["지속적인 감소", "감소 후 정체", "현상유지", "증가 후 정체", "지속적인 증가"].map(opt => {
                        const isChecked = record.revenueStatus === opt;
                        return `<label class="flex items-center gap-2 cursor-pointer group">
                                                    <input type="radio" name="revenue" ${isChecked ? 'checked' : ''} disabled class="w-4 h-4 accent-[#0055A5]" />
                                                    <span class="text-sm font-bold ${isChecked ? 'text-[#0055A5]' : 'text-slate-500'}">${opt}</span>
                                                </label>`;
                    }).join('')}
                                        </div>
                                    </div>
                                </section>

                                <!-- 2. 사업운영 주요 현황 -->
                                <section>
                                    <div class="flex items-center gap-2 mb-4"><div class="w-1.5 h-6 bg-[#0055A5]"></div><h2 class="text-xl font-black text-slate-800 uppercase tracking-tight">2. 사업운영 주요 현황</h2></div>
                                    <div class="legend-box mb-5 flex flex-wrap gap-5 bg-blue-50/50 p-4 border border-blue-100/50 rounded-sm shadow-sm">
                                        <div class="w-full no-print-bg"><span class="text-xs font-black text-[#0055A5] uppercase tracking-widest underline decoration-blue-200 underline-offset-4">진단 지표 척도 안내 (1~4점)</span></div>
                                        <div class="flex gap-6">
                                            <span class="text-sm font-bold text-slate-700"><b class="text-[#0055A5]">1:</b> 전혀 그렇지 않다</span>
                                            <span class="text-sm font-bold text-slate-700"><b class="text-[#0055A5]">2:</b> 그렇지 않다</span>
                                            <span class="text-sm font-bold text-slate-700"><b class="text-[#0055A5]">3:</b> 그렇다</span>
                                            <span class="text-sm font-bold text-slate-700"><b class="text-[#0055A5]">4:</b> 매우 그렇다</span>
                                        </div>
                                    </div>
                                    <div class="overflow-x-auto border-t-2 border-slate-800">
                                        <table class="w-full border-collapse">
                                            <thead><tr class="bg-slate-50 text-xs font-black text-slate-500 border-b border-slate-200"><th class="p-4 text-center w-28 text-center-print">구분</th><th class="p-4 text-center text-center-print">진단문항</th><th class="p-4 text-center w-16">1</th><th class="p-4 text-center w-16">2</th><th class="p-4 text-center w-16">3</th><th class="p-4 text-center w-16">4</th></tr></thead>
                                            <tbody>${tableRows}</tbody>
                                        </table>
                                    </div>
                                </section>

                                <!-- 하단 2열: 우대사항 + 애로사항 -->
                                <div class="bottom-grid grid grid-cols-1 md:grid-cols-2 gap-10 items-stretch">
                                    <section class="flex flex-col">
                                        <div class="flex items-center gap-2 mb-4">
                                            <div class="w-1.5 h-6 bg-[#0055A5]"></div>
                                            <h2 class="text-xl font-black text-slate-800 uppercase tracking-tight">3. 우대사항 체크</h2>
                                        </div>
                                        <div class="benefit-grid space-y-1.5">${benefitGrid}</div>
                                    </section>
                                    <section class="flex flex-col">
                                        <div class="flex items-center gap-2 mb-4">
                                            <div class="w-1.5 h-6 bg-[#0055A5]"></div>
                                            <h2 class="text-xl font-black text-slate-800 uppercase tracking-tight">※ 기타 애로사항</h2>
                                        </div>
                                        <textarea readonly class="notes-area w-full flex-grow p-5 border border-slate-200 rounded-sm text-base bg-slate-50/50 outline-none resize-none font-medium leading-relaxed">${notes}</textarea>
                                    </section>
                                </div>
                            </div>
                        </div>
                    </div>
                `;

                setTimeout(() => window.print(), 300);
                setTimeout(() => { printArea.innerHTML = ''; printArea.className = ''; }, 1000);
            };

            // 데이터 로드
"""

adm_content = adm_content[:func_start] + new_print_survey + adm_content[func_end + 13:]

with open('admin.html', 'w', encoding='utf-8') as f:
    f.write(adm_content)
