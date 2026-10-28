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

const toolHandlers = { find_spots };

module.exports = { toolDefinitions, toolHandlers, find_spots };
