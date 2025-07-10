const functions = require('@google-cloud/functions-framework');
const axios = require('axios');
const xml2js = require('xml2js');
const cors = require('cors')({ origin: true }); // 모든 출처 허용

/**
 * 약국 정보를 공공데이터 포털에서 가져와 JSON으로 변환하여 반환하는 Cloud Function.
 * 클라이언트로부터 시도명(Q0), 시군구명(Q1), 진료요일(DG)을 쿼리 파라미터로 받습니다.
 */
functions.http('getPharmacyData', async (req, res) => {
    // CORS 미들웨어 적용
    cors(req, res, async () => {
        // 1. 공공데이터포털 API 키 가져오기 (환경 변수 또는 Secret Manager 사용 권장)
        // 이 키는 Cloud Functions 배포 시 `--set-env-vars PHARMACY_API_KEY="YOUR_PUBLIC_DATA_API_KEY"` 명령어로 설정됩니다.
        const serviceKey = process.env.PHARMACY_API_KEY;

        if (!serviceKey) {
            console.error("API Key is not set in environment variables.");
            // 클라이언트에게도 오류 메시지 반환
            return res.status(500).json({ message: "서버 설정 오류: API 키가 누락되었습니다." });
        }

        const baseUrl = 'http://apis.data.go.kr/B552657/ErmctInsttInfoInqireService/getParmacyListInfoInqire';

        
        // 2. 클라이언트로부터 쿼리 파라미터 받기 (기본값 설정)
        // req.query를 사용하여 URL 쿼리 스트링에서 파라미터를 가져옵니다.
        const Q0 = req.query.Q0 || '서울특별시'; // 시도명 (예: '서울특별시')
        const Q1 = req.query.Q1 || '강남구';   // 시군구명 (예: '강남구')
        const DG = req.query.DG || '월';     // 진료요일 (예: '월', '화', '수', '목', '금', '토', '일', '공휴일')

        // 3. 공공데이터포털 API 호출 URL 생성
        // URLSearchParams를 사용하여 안전하게 쿼리 파라미터를 인코딩합니다.
        const queryParams = new URLSearchParams({
            serviceKey: serviceKey,
            Q0: Q0,
            Q1: Q1,
            DG: DG,
            // pageNo: '1', // 필요하다면 페이지네이션 추가
            // numOfRows: '100' // 한 페이지당 결과 수 (API 문서 확인 필요)
        }).toString();

        const apiUrl = `${baseUrl}?${queryParams}`;
        console.log(`Calling API: ${apiUrl}`); // Cloud Functions 로그에서 확인할 수 있습니다.

        try {
            // 4. 공공데이터포털 API 호출
            const response = await axios.get(apiUrl);
            const xmlData = response.data;
            console.log("Received XML data (first 500 chars):", xmlData.substring(0, 500)); // 로그가 너무 길어지지 않도록 일부만 출력

            // 5. XML 데이터를 JSON으로 파싱
            // xml2js 라이브러리를 사용하여 XML을 JavaScript 객체로 변환합니다.
            // explicitArray: false -> 단일 항목도 배열이 아닌 객체로 파싱
            // ignoreAttrs: true -> XML 태그의 속성(attribute)은 무시
            const parser = new xml2js.Parser({ explicitArray: false, ignoreAttrs: true });
            const jsonData = await parser.parseStringPromise(xmlData);

            // API 응답 구조 확인 및 필요한 데이터 추출
            // 공공데이터포털 API의 응답 구조는 보통 <response><body/><items><item/></items></body/></response> 형태입니다.
            // 정확한 경로는 API 문서를 참조하세요.
            const items = jsonData?.response?.body?.items?.item;

            let pharmacyList = [];
            if (items) {
                // 'items'가 단일 약국 정보일 경우 객체로 오고, 여러 약국일 경우 배열로 오므로
                // 항상 배열 형태로 처리할 수 있도록 보장합니다.
                pharmacyList = Array.isArray(items) ? items : [items];
            }

            // 6. 클라이언트에 JSON 데이터 반환
            // HTTP 상태 코드 200 (성공)과 JSON 형식의 데이터를 응답합니다.
            res.status(200).json(pharmacyList);

        } catch (error) {
            // API 호출 또는 파싱 중 오류 발생 시 처리
            console.error('API 호출 또는 파싱 오류:', error.message);

            // axios 에러인 경우, API 응답에서 더 자세한 오류 정보를 얻을 수 있습니다.
            const errorDetail = error.response ? error.response.data : 'No response data from external API';

            // 클라이언트에게 오류 메시지 반환
            res.status(500).json({
                message: "데이터를 불러오는 데 실패했습니다.",
                error: error.message,
                detail: errorDetail // 디버깅을 위해 상세 오류 정보 포함
            });
        }
    });
});

