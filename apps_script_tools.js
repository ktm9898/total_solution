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

// --- 2. [명세서 반영] 100대 통계지표 기반 CD금리 업데이트 (트리거 대응 수정됨) ---
function refreshEconomicData() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("Sheet2");
  
  // UI 객체를 안전하게 가져오기 (트리거 실행 시 에러 방지)
  var ui = null;
  try { ui = SpreadsheetApp.getUi(); } catch (e) { /* 화면이 없는 환경 */ }

  if (!sheet) {
    if (ui) { ui.alert("'Sheet2' 시트가 없습니다."); }
    else { console.error("'Sheet2' 시트를 찾을 수 없습니다."); }
    return;
  }

  // [확인] 부장님의 인증키
  var apiKey = "FB7FM1P6EE4V82XRXJJ4"; 
  var url = "https://ecos.bok.or.kr/api/KeyStatisticList/" + apiKey + "/json/kr/1/100";

  try {
    var response = UrlFetchApp.fetch(url, {muteHttpExceptions: true});
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
        // C2(수치), D2(시점) 업데이트
        sheet.getRange(2, 3, 1, 2).setValues([[
          cdData.DATA_VALUE,
          cdData.CYCLE
        ]]);
        
        // UI가 있을 때만 토스트 알림
        if (ui) {
          ss.toast("100대 지표에서 CD수익률을 찾아 갱신했습니다.", "업데이트 완료");
        }
        console.log("업데이트 완료: " + cdData.DATA_VALUE);
        
      } else {
        var msg = "100대 지표 중 'CD수익률' 항목을 찾을 수 없습니다.";
        if (ui) { ui.alert(msg); }
        else { 
          console.warn(msg); 
          throw new Error(msg); // 트리거 환경에서 메일 알림을 위해 에러 발생
        }
      }
    } else {
      var errorMsg = result.RESULT ? result.RESULT.MESSAGE : "API 응답 오류";
      var fullMsg = "데이터를 가져오지 못했습니다.\n원인: " + errorMsg;
      if (ui) { ui.alert(fullMsg); }
      else { 
        console.error(fullMsg); 
        throw new Error(fullMsg); // 트리거 환경에서 메일 알림을 위해 에러 발생
      }
    }
  } catch (e) {
    if (ui) { ui.alert("연동 오류: " + e.toString()); }
    else { 
      console.error("연동 중 예외 발생: " + e.toString()); 
      throw e; // 트리거 환경에서 메일 알림을 위해 에러 발생
    }
  }
}
