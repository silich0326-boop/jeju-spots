const { spots } = require("../jeju_spots.json");

const MAX_RESULTS = 8;
const AREAS = ["동쪽", "서쪽", "서귀포", "제주시"];

// Claude 에 넘기는 도구 설명
const toolDefinitions = [
  {
    name: "find_spots",
    description:
      "제주특별자치도 관광지 목록(jeju_spots.json)에서 지역과 실내/야외 조건에 맞는 장소를 최대 8곳 찾아 " +
      "이름 · 지역 · 실내 여부 · 설명을 돌려준다. 이 목록에 있는 장소만 추천할 수 있으며, " +
      "목록 밖 장소는 없다. 결과에 없는 장소는 지어내지 말고 '목록에 없다'고 답한다. " +
      "운영시간 · 요금 · 휴무 정보는 담겨 있지 않다.",
    input_schema: {
      type: "object",
      properties: {
        area: {
          type: "string",
          enum: AREAS,
          description: "찾을 지역. 동쪽 · 서쪽 · 서귀포 · 제주시 중 하나.",
        },
        indoor: {
          type: "boolean",
          description: "true 면 실내만, false 면 야외만. 생략하면 둘 다.",
        },
      },
      required: ["area"],
    },
  },
];

// 도구 실행 함수. 목록의 area 는 "동쪽(성산)" 처럼 읍면이 붙어 있어 앞부분으로 비교한다.
function find_spots({ area, indoor } = {}) {
  if (!AREAS.includes(area)) {
    return { error: `area 는 ${AREAS.join(" · ")} 중 하나여야 합니다.` };
  }

  const found = spots
    .filter((s) => s.area === area || s.area.startsWith(area + "("))
    .filter((s) => indoor === undefined || s.indoor === indoor);

  return {
    total: found.length,
    spots: found.slice(0, MAX_RESULTS).map((s) => ({
      name: s.name,
      area: s.area,
      indoor: s.indoor,
      description: s.type,
    })),
  };
}

// 날씨 조회용 지역 중심 좌표 (Open-Meteo, 키 불필요)
const WEATHER_POINTS = {
  동쪽: [33.46, 126.94],
  서쪽: [33.41, 126.27],
  서귀포: [33.25, 126.56],
  제주시: [33.5, 126.53],
};

// WMO 날씨 코드 → 한글
const weatherText = (c) =>
  c === 0 ? "맑음"
  : c <= 3 ? "구름 조금~흐림"
  : c <= 48 ? "안개"
  : c <= 57 ? "이슬비"
  : c <= 67 ? "비"
  : c <= 77 ? "눈"
  : c <= 82 ? "소나기"
  : c <= 86 ? "눈 소나기"
  : "뇌우";

toolDefinitions.push({
  name: "get_weather",
  description:
    "제주 지역(동쪽 · 서쪽 · 서귀포 · 제주시)의 현재 날씨와 오늘·내일 예보(기온, 강수확률, 바람)를 돌려준다. " +
    "실내/야외 추천을 정하기 전에 비·바람 여부를 확인할 때 사용한다. 제주 밖 지역은 조회할 수 없다.",
  input_schema: {
    type: "object",
    properties: {
      area: {
        type: "string",
        enum: AREAS,
        description: "날씨를 볼 지역. 동쪽 · 서쪽 · 서귀포 · 제주시 중 하나.",
      },
    },
    required: ["area"],
  },
});

async function get_weather({ area } = {}) {
  const point = WEATHER_POINTS[area];
  if (!point) return { error: `area 는 ${AREAS.join(" · ")} 중 하나여야 합니다.` };

  const url =
    "https://api.open-meteo.com/v1/forecast" +
    `?latitude=${point[0]}&longitude=${point[1]}` +
    "&current=temperature_2m,precipitation,wind_speed_10m,weather_code" +
    "&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max" +
    "&timezone=Asia%2FSeoul&forecast_days=2";

  const res = await fetch(url);
  if (!res.ok) return { error: `날씨 조회 실패 (${res.status})` };
  const w = await res.json();

  return {
    area,
    now: {
      weather: weatherText(w.current.weather_code),
      temperature_c: w.current.temperature_2m,
      precipitation_mm: w.current.precipitation,
      wind_kmh: w.current.wind_speed_10m,
    },
    forecast: w.daily.time.map((date, i) => ({
      date,
      min_c: w.daily.temperature_2m_min[i],
      max_c: w.daily.temperature_2m_max[i],
      rain_probability_percent: w.daily.precipitation_probability_max[i],
    })),
  };
}

const toolHandlers = { find_spots, get_weather };

module.exports = { toolDefinitions, toolHandlers, find_spots, get_weather };
