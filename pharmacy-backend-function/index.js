const functions = require('@google-cloud/functions-framework');
const axios = require('axios');
const xml2js = require('xml2js');
const cors = require('cors'); // CORS 미들웨어 추가

// CORS 설정
const corsMiddleware = cors({ origin: true });

functions.http('getPharmacyData', async (req, res) => {
  // CORS 미들웨어 적용
  corsMiddleware(req, res, async () => {
    // 요청 파라미터 가져오기
    const Q0 = req.query.Q0; // 시/도 (예: 서울특별시)
    const Q1 = req.query.Q1; // 시/군/구 (예: 강남구)
    let DG = req.query.DG; // 요일 (예: 월, 화, 수, 목, 금, 토, 일, 공휴일)

    // 환경 변수에서 API 키 가져오기
    const serviceKey = process.env.PHARMACY_API_KEY;

    // API 키 유효성 검사
    if (!serviceKey) {
      console.error('API Key is not set in environment variables.');
      res.status(500).json({ message: '서버 설정 오류: API 키가 누락되었습니다.' });
      return;
    }

    // 필수 파라미터 유효성 검사
    if (!Q0 || !Q1 || !DG) {
      console.error('Missing required query parameters: Q0 (sido), Q1 (sigungu), or DG (day).');
      res.status(400).json({ message: '필수 검색 조건(시/도, 시/군/구, 요일)이 누락되었습니다.' });
      return;
    }

    // --- 요일(DG) 변환 로직 (더 안전하게) ---
    const dayMap = {
      '월': '1',
      '화': '2',
      '수': '3',
      '목': '4',
      '금': '5',
      '토': '6',
      '일': '7',
      '공휴일': '8' // 공공데이터포털 문서에 따라 다를 수 있음. 확인 필요.
    };

    const originalDG = DG; // 원본 DG 값을 로그에 남기기 위해 저장
    DG = dayMap[DG] || DG; // dayMap에 없으면 원본 값 그대로 사용 (에러 방지)

    // 공공데이터포털 API URL 구성
    const apiUrl = `http://apis.data.go.kr/B552657/ErmctInsttInfoInqireService/getParmacyList?ServiceKey=${serviceKey}&Q0=${Q0}&Q1=${Q1}&DG=${DG}&pageNo=1&numOfRows=10`;

    try {
      // --- 디버깅을 위한 로그 추가 ---
      console.log("Original DG from request:", originalDG); // 원본 DG 값 로그
      console.log("Converted DG for API call:", DG);       // 변환된 DG 값 로그
      console.log("Constructed API URL (without key):", `http://apis.data.go.kr/B552657/ErmctInsttInfoInqireService/getParmacyList?ServiceKey=***&Q0=${Q0}&Q1=${Q1}&DG=${DG}&pageNo=1&numOfRows=10`);
      console.log("API Key length:", serviceKey ? serviceKey.length : "undefined");
      console.log("Q0 (sido):", Q0);
      console.log("Q1 (sigungu):", Q1);
      console.log("DG (day):", DG);
      // ----------------------------------------------

      const response = await axios.get(apiUrl);
      const xmlData = response.data;

      // --- 디버깅을 위한 로그 추가 (XML 데이터 확인) ---
      console.log("Received XML data (first 500 chars):", xmlData.substring(0, 500));
      // -------------------------------------------------

      // XML 데이터를 JSON으로 파싱
      const parser = new xml2js.Parser({ explicitArray: false });
      const jsonData = await parser.parseStringPromise(xmlData);

      // 데이터 가공 및 클라이언트에게 전송
      const items = jsonData?.response?.body?.items?.item;

      if (items) {
        // 단일 항목일 경우 배열로 만듦
        const pharmacyList = Array.isArray(items) ? items : [items];
        res.status(200).json(pharmacyList);
      } else {
        res.status(200).json([]); // 데이터가 없을 경우 빈 배열 반환
      }

    } catch (error) {
      console.error('API 호출 또는 파싱 오류:', error.message);
      // 디버깅을 위해 에러 객체 전체를 로그에 남김
      console.error('Full Error Object:', error); 

      // 공공데이터포털에서 반환한 오류 메시지를 그대로 전달 시도
      if (error.response && error.response.data) {
        try {
          // 에러 응답 XML도 로그에 남김
          console.error("Error Response XML:", error.response.data.substring(0, 500)); 

          const parser = new xml2js.Parser({ explicitArray: false });
          const errorJson = await parser.parseStringPromise(error.response.data);
          const errorMessage = errorJson?.response?.header?.resultMsg || '알 수 없는 API 응답 오류';
          console.error('Detailed API Error Response:', errorMessage);
          res.status(error.response.status).json({ message: `API 응답 오류: ${errorMessage}` });
        } catch (parseError) {
          console.error('Error parsing API error response (likely non-XML):', parseError.message);
          console.error('Raw error response data (first 500 chars):', error.response.data.substring(0, 500));
          res.status(500).json({ message: '데이터 처리 중 오류 발생: 잘못된 API 응답 형식 또는 네트워크 문제' });
        }
      } else {
        res.status(500).json({ message: '데이터를 불러오는 데 실패했습니다.' });
      }
    }
  });
});
