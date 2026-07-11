/**
 * ============================================================
 *  🛠️ 실무비서 도구 (경제 데이터 업데이트 & 대용량 주입기)
 * ============================================================
 * 
 *  [수정 사항]
 *  - 2026-04-08: 시간 기반 트리거 실행 시 UI 에러(getUi) 방지 로직 추가
 */

function onOpen() {
  var ui = SpreadsheetApp.getUi();
  ui.createMenu('🛠️ 실무비서 도구')
    .addItem('📖 대용량 원문 주입기 열기', 'showSidebar')
    .addSeparator()
    .addItem('📈 CD금리 즉시 업데이트', 'refreshEconomicData')
    .addToUi();
}

// --- 1. 원문 주입기 기능 (기존 유지) ---
function showSidebar() {
  var html = HtmlService.createHtmlOutput(
    '<style>body{font-family:sans-serif;padding:10px}textarea{width:100%;height:300px;margin-bottom:10px;border:1.5pt solid #ccc;padding:5px}button{width:100%;padding:10px;background:#0055A5;color:white;border:none;font-weight:bold;cursor:pointer}</style>' +
    '<h3>대용량 원문 주입기</h3><textarea id="longText" placeholder="원문을 붙여넣으세요..."></textarea>' +
    '<button onclick="injectText()">원문 자동 분할 주입 시작</button>' +
    '<script>function injectText(){var text = document.getElementById("longText").value;' +
    'google.script.run.withSuccessHandler(function(){alert("성공적으로 분할 주입되었습니다!");}).processLongText(text);}</script>'
  ).setTitle('원문 주입 서비스').setWidth(350);
  SpreadsheetApp.getUi().showSidebar(html);
}

function processLongText(text) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  var cell = sheet.getActiveCell();
  var limit = 45000; 
  var row = cell.getRow();
  var col = cell.getColumn();
  for (var i = 0, j = 0; i < text.length; i += limit, j++) {
    sheet.getRange(row, col + j).setValue(text.substring(i, i + limit));
  }
}

// --- 2. [명세서 반영] 100대 통계지표 기반 CD금리 업데이트 ---
// [수정 2026-07-11] ECOS API 간헐적 접속 불가(Address unavailable) 대응
//   - 지수 백오프 재시도 (최대 5회)
//   - 접속 타임아웃 설정
//   - 마지막 성공값 캐시로 일시적 장애 시 기존값 유지
//   - 연속 실패 횟수 추적 → 3회 연속 실패 시에만 에러 메일 발생

/** ECOS API를 지수 백오프로 재시도하며 호출 */
function fetchWithRetry_(url, maxRetries) {
  var lastError = null;
  for (var attempt = 0; attempt < maxRetries; attempt++) {
    try {
      var response = UrlFetchApp.fetch(url, {
        muteHttpExceptions: true,
        validateHttpsCertificates: true,
        followRedirects: true
      });
      var code = response.getResponseCode();
      if (code === 200) {
        return response;
      }
      lastError = new Error("HTTP " + code + ": " + response.getContentText().substring(0, 200));
    } catch (e) {
      lastError = e;
    }
    // 지수 백오프 대기: 2초, 4초, 8초, 16초, 32초
    if (attempt < maxRetries - 1) {
      var waitSec = Math.pow(2, attempt + 1);
      Utilities.sleep(waitSec * 1000);
    }
  }
  throw new Error("ECOS API " + maxRetries + "회 재시도 모두 실패: " + lastError.toString());
}

function refreshEconomicData() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("Sheet2");
  var props = PropertiesService.getScriptProperties();
  
  // UI 객체를 안전하게 가져오기 (트리거 실행 시 에러 방지)
  var ui = null;
  try { ui = SpreadsheetApp.getUi(); } catch (e) { /* 화면이 없는 환경 */ }

  if (!sheet) {
    if (ui) { ui.alert("'Sheet2' 시트가 없습니다."); }
    else { console.error("'Sheet2' 시트를 찾을 수 없습니다."); }
    return;
  }

  var apiKey = "FB7FM1P6EE4V82XRXJJ4"; 
  var url = "https://ecos.bok.or.kr/api/KeyStatisticList/" + apiKey + "/json/kr/1/100";

  try {
    var response = fetchWithRetry_(url, 5);
    var resText = response.getContentText();
    var result = JSON.parse(resText);

    if (result.KeyStatisticList && result.KeyStatisticList.row) {
      var rows = result.KeyStatisticList.row;
      var cdData = null;

      for (var i = 0; i < rows.length; i++) {
        if (rows[i].KEYSTAT_NAME.indexOf("CD수익률") !== -1) {
          cdData = rows[i];
          break;
        }
      }

      if (cdData) {
        sheet.getRange(2, 3, 1, 2).setValues([[
          cdData.DATA_VALUE,
          cdData.CYCLE
        ]]);
        
        // 성공값 캐시 저장 & 연속 실패 카운터 리셋
        props.setProperties({
          'ECOS_LAST_CD_VALUE': cdData.DATA_VALUE,
          'ECOS_LAST_CD_CYCLE': cdData.CYCLE,
          'ECOS_LAST_SUCCESS': new Date().toISOString(),
          'ECOS_FAIL_COUNT': '0'
        });

        if (ui) {
          ss.toast("CD수익률(91일) " + cdData.DATA_VALUE + "% (" + cdData.CYCLE + ")", "업데이트 완료");
        }
        console.log("업데이트 완료: CD수익률 " + cdData.DATA_VALUE + "% (" + cdData.CYCLE + ")");
        
      } else {
        var msg = "100대 지표 중 'CD수익률' 항목을 찾을 수 없습니다.";
        if (ui) { ui.alert(msg); }
        else { console.warn(msg); throw new Error(msg); }
      }
    } else {
      var errorMsg = result.RESULT ? result.RESULT.MESSAGE : "API 응답 오류";
      var fullMsg = "데이터를 가져오지 못했습니다.\n원인: " + errorMsg;
      if (ui) { ui.alert(fullMsg); }
      else { console.error(fullMsg); throw new Error(fullMsg); }
    }

  } catch (e) {
    // --- 실패 처리 ---
    var failCount = parseInt(props.getProperty('ECOS_FAIL_COUNT') || '0', 10) + 1;
    props.setProperty('ECOS_FAIL_COUNT', String(failCount));

    // 캐시된 마지막 성공값이 있으면 시트에 유지 (데이터 공백 방지)
    var cachedValue = props.getProperty('ECOS_LAST_CD_VALUE');
    var cachedCycle = props.getProperty('ECOS_LAST_CD_CYCLE');
    if (cachedValue && cachedCycle) {
      sheet.getRange(2, 3, 1, 2).setValues([[cachedValue, cachedCycle]]);
      console.log("API 실패 → 캐시된 값 유지: " + cachedValue + "% (" + cachedCycle + ")");
    }

    if (ui) {
      ui.alert("연동 오류: " + e.toString() + 
        (cachedValue ? "\n\n(이전 데이터 " + cachedValue + "%가 유지됩니다)" : ""));
    } else {
      console.error("ECOS 연동 실패 (" + failCount + "회 연속): " + e.toString());
      // 3회 연속 실패 시에만 에러 메일 발생 (매일 메일 폭탄 방지)
      if (failCount >= 3) {
        props.setProperty('ECOS_FAIL_COUNT', '0'); // 리셋하여 다음 3회 주기 시작
        throw new Error("[" + failCount + "회 연속 실패] " + e.toString() +
          "\n마지막 성공: " + (props.getProperty('ECOS_LAST_SUCCESS') || '기록 없음'));
      }
    }
  }
}
