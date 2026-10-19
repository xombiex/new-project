/**
 * Manufacturer performance figures for popular and enthusiast models (US-market, typical trim),
 * used where the EPA data has no horsepower or 0–60. Matched by make and a model pattern within a
 * model-year range; the first match wins, so specific trims are listed before broad ones.
 * Figures are rounded manufacturer claims (0–60 in seconds; Tesla doesn't publish horsepower).
 */
export type Performance = { hp?: number; torque?: number; zeroToSixty?: number };

/** Optional engine condition: cylinder count and/or displacement range in liters. */
type Engine = { cyl?: number; minDispl?: number; maxDispl?: number };
type Entry = [make: string, model: RegExp, from: number, to: number, perf: Performance, engine?: Engine];

const P = (hp: number | undefined, torque: number | undefined, zeroToSixty: number | undefined): Performance => ({ hp, torque, zeroToSixty });

const TABLE: Entry[] = [
  // Porsche
  ['porsche', /911 gt3 rs/i, 2023, 2030, P(518, 342, 3.0)],
  ['porsche', /911 gt3/i, 2022, 2030, P(502, 346, 3.2)],
  ['porsche', /911 turbo s/i, 2021, 2030, P(640, 590, 2.6)],
  ['porsche', /911 turbo/i, 2021, 2030, P(572, 553, 2.7)],
  ['porsche', /911 carrera (4 )?gts/i, 2022, 2030, P(473, 420, 3.1)],
  ['porsche', /911 carrera 4s|911 targa 4s/i, 2020, 2030, P(443, 390, 3.2)],
  ['porsche', /911 carrera s/i, 2020, 2030, P(443, 390, 3.3)],
  ['porsche', /911 carrera|911 targa/i, 2020, 2030, P(379, 331, 4.0)],
  ['porsche', /911 carrera s/i, 2017, 2019, P(420, 368, 3.5)],
  ['porsche', /911 carrera/i, 2017, 2019, P(370, 331, 4.0)],
  ['porsche', /718 .*gts 4\.0|cayman gt4/i, 2020, 2030, P(394, 309, 3.8)],
  ['porsche', /718 (cayman|boxster) s/i, 2017, 2030, P(350, 309, 4.2)],
  ['porsche', /718 (cayman|boxster)/i, 2017, 2030, P(300, 280, 4.9)],
  ['porsche', /taycan turbo s/i, 2020, 2030, P(750, 774, 2.6)],
  ['porsche', /taycan turbo/i, 2020, 2030, P(670, 627, 3.0)],
  ['porsche', /macan s/i, 2019, 2024, P(375, 383, 4.6)],
  ['porsche', /macan/i, 2019, 2024, P(261, 295, 6.0)],
  ['porsche', /cayenne/i, 2019, 2023, P(335, 332, 5.6)],
  // Chevrolet
  ['chevrolet', /corvette e-ray/i, 2024, 2030, P(655, 595, 2.5)],
  ['chevrolet', /corvette z06/i, 2023, 2030, P(670, 460, 2.6)],
  ['chevrolet', /corvette/i, 2020, 2030, P(490, 465, 2.9)],
  ['chevrolet', /corvette z06/i, 2015, 2019, P(650, 650, 3.0)],
  ['chevrolet', /corvette/i, 2014, 2019, P(455, 460, 3.8)],
  ['chevrolet', /camaro zl1/i, 2017, 2024, P(650, 650, 3.5)],
  ['chevrolet', /camaro/i, 2016, 2024, P(455, 455, 4.0), { cyl: 8 }],
  ['chevrolet', /camaro/i, 2016, 2024, P(335, 284, 5.1), { cyl: 6 }],
  ['chevrolet', /camaro/i, 2016, 2024, P(275, 295, 5.4)],
  ['chevrolet', /silverado/i, 2019, 2030, P(420, 460, 5.5), { cyl: 8, minDispl: 6 }],
  ['chevrolet', /silverado/i, 2019, 2030, P(355, 383, 6.3)],
  ['chevrolet', /tahoe|suburban/i, 2021, 2030, P(355, 383, 6.6)],
  // Ford
  ['ford', /mustang shelby gt500|shelby gt500/i, 2020, 2022, P(760, 625, 3.3)],
  ['ford', /mustang dark horse/i, 2024, 2030, P(500, 418, 3.7)],
  ['ford', /mustang mach-e/i, 2021, 2030, P(346, 428, 4.8)],
  ['ford', /mustang/i, 2024, 2030, P(480, 415, 4.3), { cyl: 8 }],
  ['ford', /mustang/i, 2024, 2030, P(315, 350, 5.0)],
  ['ford', /mustang/i, 2018, 2023, P(460, 420, 4.3), { cyl: 8 }],
  ['ford', /mustang/i, 2018, 2023, P(310, 350, 5.3)],
  ['ford', /f150 raptor r|f-150 raptor r/i, 2023, 2030, P(700, 640, 3.7)],
  ['ford', /raptor/i, 2021, 2030, P(450, 510, 5.5)],
  ['ford', /f150|f-150/i, 2021, 2030, P(400, 410, 6.1), { cyl: 8 }],
  ['ford', /f150|f-150/i, 2021, 2030, P(400, 500, 5.5), { cyl: 6, minDispl: 3.4 }],
  ['ford', /f150|f-150/i, 2021, 2030, P(325, 400, 6.5), { cyl: 6 }],
  ['ford', /bronco sport/i, 2021, 2030, P(181, 190, 8.8)],
  ['ford', /bronco/i, 2021, 2030, P(300, 325, 6.6)],
  ['ford', /focus rs/i, 2016, 2018, P(350, 350, 4.6)],
  // Dodge / Ram / Jeep
  ['dodge', /challenger srt hellcat redeye|challenger.*redeye/i, 2019, 2023, P(797, 707, 3.4)],
  ['dodge', /challenger srt hellcat|challenger.*hellcat/i, 2015, 2023, P(717, 656, 3.6)],
  ['dodge', /charger srt hellcat|charger.*hellcat/i, 2015, 2023, P(717, 650, 3.6)],
  ['dodge', /challenger/i, 2015, 2023, P(485, 475, 4.2), { minDispl: 6.3 }],
  ['dodge', /charger/i, 2015, 2023, P(485, 475, 4.3), { minDispl: 6.3 }],
  ['dodge', /challenger/i, 2015, 2023, P(375, 410, 5.1), { cyl: 8 }],
  ['dodge', /charger/i, 2015, 2023, P(370, 395, 5.1), { cyl: 8 }],
  ['dodge', /challenger/i, 2015, 2023, P(303, 268, 6.3), { cyl: 6 }],
  ['dodge', /charger/i, 2015, 2023, P(300, 264, 6.3), { cyl: 6 }],
  ['dodge', /durango srt/i, 2018, 2030, P(475, 470, 4.4)],
  ['ram', /trx/i, 2021, 2024, P(702, 650, 3.7)],
  ['ram', /1500/i, 2019, 2030, P(395, 410, 6.5)],
  ['jeep', /trackhawk/i, 2018, 2021, P(707, 645, 3.5)],
  ['jeep', /wrangler.*392|rubicon 392/i, 2021, 2030, P(470, 470, 4.5)],
  ['jeep', /wrangler/i, 2018, 2030, P(285, 260, 7.0)],
  // Tesla (horsepower not published)
  ['tesla', /model s plaid|model s.*plaid/i, 2021, 2030, P(1020, undefined, 2.0)],
  ['tesla', /model s/i, 2021, 2030, P(670, undefined, 3.1)],
  ['tesla', /model 3 performance|model 3.*performance/i, 2018, 2030, P(undefined, undefined, 3.1)],
  ['tesla', /model 3 long range|model 3.*long range/i, 2018, 2030, P(undefined, undefined, 4.2)],
  ['tesla', /model 3/i, 2018, 2030, P(undefined, undefined, 5.8)],
  ['tesla', /model y performance|model y.*performance/i, 2020, 2030, P(undefined, undefined, 3.5)],
  ['tesla', /model y/i, 2020, 2030, P(undefined, undefined, 4.8)],
  ['tesla', /model x plaid|model x.*plaid/i, 2022, 2030, P(1020, undefined, 2.5)],
  ['tesla', /cybertruck/i, 2024, 2030, P(600, 7435, 4.1)],
  // Toyota / Lexus
  ['toyota', /gr supra/i, 2021, 2030, P(382, 368, 3.9)],
  ['toyota', /gr ?86|86/i, 2022, 2030, P(228, 184, 5.8)],
  ['toyota', /gr corolla/i, 2023, 2030, P(300, 273, 5.0)],
  ['toyota', /camry/i, 2018, 2024, P(301, 267, 5.8), { cyl: 6 }],
  ['toyota', /camry/i, 2018, 2024, P(203, 184, 7.6)],
  ['toyota', /corolla/i, 2019, 2030, P(169, 151, 8.0)],
  ['toyota', /rav4/i, 2019, 2030, P(203, 184, 8.0)],
  ['toyota', /tacoma/i, 2016, 2023, P(278, 265, 7.3)],
  ['toyota', /tundra/i, 2022, 2030, P(389, 479, 6.1)],
  ['toyota', /4runner/i, 2010, 2024, P(270, 278, 7.8)],
  ['toyota', /prius/i, 2023, 2030, P(194, undefined, 7.2)],
  ['lexus', /rc f/i, 2015, 2030, P(472, 395, 4.2)],
  ['lexus', /lc 500/i, 2018, 2030, P(471, 398, 4.4)],
  ['lexus', /is 500/i, 2022, 2030, P(472, 395, 4.4)],
  ['lexus', /is 350/i, 2017, 2030, P(311, 280, 5.6)],
  // Honda / Acura
  ['honda', /civic type r/i, 2023, 2030, P(315, 310, 5.0)],
  ['honda', /civic type r/i, 2017, 2021, P(306, 295, 5.4)],
  ['honda', /civic si/i, 2022, 2030, P(200, 192, 6.8)],
  ['honda', /civic/i, 2022, 2030, P(180, 177, 7.4), { maxDispl: 1.6 }],
  ['honda', /civic/i, 2022, 2030, P(158, 138, 8.0)],
  ['honda', /accord/i, 2018, 2022, P(252, 273, 5.7), { minDispl: 1.9 }],
  ['honda', /accord/i, 2018, 2022, P(192, 192, 7.3)],
  ['honda', /cr-v/i, 2017, 2030, P(190, 179, 8.0)],
  ['honda', /s2000/i, 2000, 2009, P(240, 153, 5.8)],
  ['acura', /nsx/i, 2017, 2022, P(573, 476, 2.9)],
  ['acura', /integra/i, 2023, 2030, P(200, 192, 7.0)],
  // Subaru / Mazda / Nissan
  ['subaru', /wrx sti/i, 2015, 2021, P(310, 290, 4.6)],
  ['subaru', /wrx/i, 2022, 2030, P(271, 258, 5.5)],
  ['subaru', /wrx/i, 2015, 2021, P(268, 258, 5.4)],
  ['subaru', /brz/i, 2022, 2030, P(228, 184, 5.8)],
  ['subaru', /outback/i, 2020, 2030, P(182, 176, 8.5)],
  ['mazda', /mx-5|miata/i, 2019, 2030, P(181, 151, 5.7)],
  ['mazda', /mazda3.*turbo|3 turbo/i, 2021, 2030, P(250, 320, 5.6)],
  ['mazda', /cx-5/i, 2017, 2030, P(187, 186, 8.0)],
  ['nissan', /gt-r nismo/i, 2017, 2030, P(600, 481, 2.5)],
  ['nissan', /gt-r/i, 2017, 2030, P(565, 467, 2.9)],
  ['nissan', /^z( |$)|z nismo/i, 2023, 2030, P(400, 350, 4.3)],
  ['nissan', /370z/i, 2009, 2020, P(332, 270, 5.1)],
  ['nissan', /altima/i, 2019, 2030, P(188, 180, 7.6)],
  // BMW
  ['bmw', /m3 competition|m4 competition/i, 2021, 2030, P(503, 479, 3.8)],
  ['bmw', /m3|m4/i, 2021, 2030, P(473, 406, 4.1)],
  ['bmw', /m2/i, 2023, 2030, P(453, 406, 4.1)],
  ['bmw', /m5 competition/i, 2018, 2024, P(617, 553, 3.1)],
  ['bmw', /m5/i, 2018, 2024, P(600, 553, 3.1)],
  ['bmw', /m340i/i, 2020, 2030, P(382, 369, 4.1)],
  ['bmw', /330i/i, 2019, 2030, P(255, 295, 5.6)],
  ['bmw', /z4 m40i|z4 sdrive ?m40i/i, 2019, 2030, P(382, 369, 3.9)],
  // Mercedes-Benz
  ['mercedes-benz', /amg g ?63/i, 2019, 2030, P(577, 627, 4.5)],
  ['mercedes-benz', /g ?550/i, 2019, 2030, P(416, 450, 5.6)],
  ['mercedes-benz', /amg e ?63/i, 2018, 2023, P(603, 627, 3.3)],
  ['mercedes-benz', /amg c ?63/i, 2015, 2021, P(503, 516, 3.9)],
  ['mercedes-benz', /amg gt/i, 2016, 2030, P(523, 494, 3.7)],
  ['mercedes-benz', /c ?300/i, 2022, 2030, P(255, 295, 5.9)],
  // Audi / VW
  ['audi', /r8/i, 2020, 2023, P(602, 413, 3.1)],
  ['audi', /rs ?e-tron gt/i, 2022, 2030, P(637, 612, 3.1)],
  ['audi', /rs ?6/i, 2020, 2030, P(591, 590, 3.5)],
  ['audi', /rs ?3/i, 2022, 2030, P(401, 369, 3.6)],
  ['audi', /s4/i, 2018, 2030, P(349, 369, 4.4)],
  ['audi', /a4/i, 2017, 2030, P(261, 273, 5.2)],
  ['volkswagen', /golf r/i, 2022, 2030, P(315, 295, 4.7)],
  ['volkswagen', /gti/i, 2022, 2030, P(241, 273, 5.9)],
  ['volkswagen', /jetta gli/i, 2019, 2030, P(228, 258, 5.6)],
  // Hyundai / Kia / Genesis
  ['hyundai', /ioniq 5 n/i, 2025, 2030, P(641, 545, 3.3)],
  ['hyundai', /elantra n/i, 2022, 2030, P(276, 289, 5.0)],
  ['hyundai', /veloster n/i, 2019, 2022, P(275, 260, 5.4)],
  ['kia', /ev6 gt/i, 2023, 2030, P(576, 545, 3.4)],
  ['kia', /stinger/i, 2018, 2023, P(368, 376, 4.7)],
  ['genesis', /g70/i, 2019, 2030, P(365, 376, 4.5)],
  // Exotics and others
  ['lamborghini', /huracan/i, 2020, 2024, P(631, 443, 2.9)],
  ['lamborghini', /urus/i, 2019, 2030, P(641, 627, 3.5)],
  ['lamborghini', /aventador/i, 2017, 2022, P(759, 531, 2.8)],
  ['ferrari', /sf90/i, 2021, 2030, P(986, 590, 2.5)],
  ['ferrari', /296/i, 2022, 2030, P(818, 546, 2.9)],
  ['ferrari', /f8/i, 2020, 2023, P(710, 568, 2.9)],
  ['ferrari', /roma/i, 2021, 2030, P(612, 561, 3.4)],
  ['ferrari', /488/i, 2016, 2019, P(661, 561, 3.0)],
  ['mclaren', /720s/i, 2018, 2023, P(710, 568, 2.8)],
  ['mclaren', /570s/i, 2016, 2021, P(562, 443, 3.1)],
  ['cadillac', /ct5-v blackwing|ct5.*blackwing/i, 2022, 2030, P(668, 659, 3.6)],
  ['cadillac', /ct4-v blackwing|ct4.*blackwing/i, 2022, 2030, P(472, 445, 4.1)],
  ['cadillac', /escalade/i, 2021, 2030, P(420, 460, 5.9)],
  ['alfa romeo', /giulia quadrifoglio|giulia.*quadrifoglio/i, 2017, 2030, P(505, 443, 3.8)],
  ['mini', /john cooper works|jcw/i, 2015, 2030, P(228, 236, 6.0)],
  ['mini', /cooper s/i, 2015, 2030, P(189, 207, 6.4)],
  ['rivian', /r1t|r1s/i, 2022, 2030, P(835, 908, 3.0)],
];

/** Performance for a car, or null if it isn't in the table. Engine details pick the right version (V8 vs four-cylinder). */
export function lookupPerformance(make: string, model: string, year: number | null, engine?: { cyl?: number; displ?: number }): Performance | null {
  const mk = make.trim().toLowerCase();
  for (const [m, re, from, to, perf, eng] of TABLE) {
    if (m !== mk) continue;
    if (year != null && (year < from || year > to)) continue;
    if (!re.test(model)) continue;
    if (eng) {
      if (eng.cyl != null && engine?.cyl !== eng.cyl) continue;
      if (eng.minDispl != null && !(engine?.displ != null && engine.displ >= eng.minDispl)) continue;
      if (eng.maxDispl != null && !(engine?.displ != null && engine.displ <= eng.maxDispl)) continue;
    }
    return perf;
  }
  return null;
}
