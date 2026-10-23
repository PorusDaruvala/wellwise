import json, re

src = open('Wellwise_V2_200_Tips_Agent_Prototype.html', encoding='utf-8').read()
tips = json.loads(re.search(r'<script id="tips-data" type="application/json">(.*?)</script>', src, re.S).group(1))
scen = json.loads(re.search(r'<script id="scenarios-data" type="application/json">(.*?)</script>', src, re.S).group(1))
T = {t['id']: t for t in tips}
def ids(*nums): return ['ww-%03d' % n for n in nums]

# ---------- 1. Tags and concepts ----------
CAT_TAG = {
    'Food & nutrition': 'food', 'Movement & mobility': 'movement', 'Sleep & recovery': 'sleep',
    'Household & cookware': 'household', 'Skincare & personal care': 'skincare',
    'Supplements & medication': 'medications', 'Prevention & tests': 'prevention',
    'Mental wellbeing': 'mental', 'Air, water & environment': 'environment', 'Everyday health': 'everyday'}
CAT_CONCEPT = {
    'Food & nutrition': 'food_nutrition', 'Movement & mobility': 'movement_mobility', 'Sleep & recovery': 'sleep_recovery',
    'Household & cookware': 'household_cookware', 'Skincare & personal care': 'skincare_personal_care',
    'Supplements & medication': 'supplements_medication', 'Prevention & tests': 'prevention_tests',
    'Mental wellbeing': 'mental_wellbeing', 'Air, water & environment': 'air_water_environment', 'Everyday health': 'everyday_health'}
# Topic tags that the original file had wrong or that add real meaning
EXTRA_TAGS = {
    'ww-001': ['heart'], 'ww-002': ['heart'], 'ww-007': ['heart'], 'ww-008': ['metabolic'], 'ww-011': ['heart'],
    'ww-021': ['metabolic'], 'ww-043': ['caffeine'], 'ww-047': ['alcohol'], 'ww-058': ['movement'],
    'ww-062': ['cookware'], 'ww-064': ['plastics'], 'ww-080': ['plastics'], 'ww-082': ['sun'], 'ww-096': ['sun'],
    'ww-121': ['heart'], 'ww-122': ['metabolic'], 'ww-123': ['heart'], 'ww-124': ['heart'], 'ww-126': ['heart'],
    'ww-136': ['metabolic'], 'ww-137': ['sleep'], 'ww-151': ['movement'], 'ww-154': ['caffeine'],
    'ww-158': ['alcohol', 'sleep'], 'ww-162': ['movement'], 'ww-169': ['sun'], 'ww-181': ['movement'],
    'ww-185': ['alcohol'], 'ww-196': ['movement', 'travel'], 'ww-059': ['travel'], 'ww-191': ['travel'],
    'ww-104': ['food'], 'ww-020': ['food'], 'ww-118': ['food'], 'ww-143': ['breathing'],
}
for t in tips:
    base = CAT_TAG[t['category']]
    t['tags'] = list(dict.fromkeys([base] + EXTRA_TAGS.get(t['id'], [])))
    t['concepts'] = [CAT_CONCEPT[t['category']]] + [x for x in t['tags'] if x != base]

# ---------- 2. Drop boilerplate impact; per-tip evidence grade (draft) ----------
DEFAULT_GRADE = {
    'Food & nutrition': 'Strong', 'Movement & mobility': 'Strong', 'Sleep & recovery': 'Moderate',
    'Household & cookware': 'Safety practice', 'Skincare & personal care': 'Moderate',
    'Supplements & medication': 'Safety practice', 'Prevention & tests': 'Strong', 'Mental wellbeing': 'Moderate',
    'Air, water & environment': 'Safety practice', 'Everyday health': 'Strong'}
GRADE_OVERRIDE = {}
for i in ids(12, 18, 28, 29, 32, 57, 58, 71, 75, 80, 84, 94, 100, 108, 146, 149, 150, 172, 199): GRADE_OVERRIDE[i] = 'Limited'
for i in ids(56, 70, 82, 87, 127, 161, 162, 164, 165, 183, 185, 128, 129): GRADE_OVERRIDE[i] = 'Strong'
for i in ids(21, 42, 43, 47, 117, 141, 142, 153, 163, 180): GRADE_OVERRIDE[i] = 'Moderate'
for t in tips:
    t.pop('impact', None); t.pop('evidence', None); t.pop('reviewStatus', None); t.pop('evidenceScope', None)
    t['grade'] = GRADE_OVERRIDE.get(t['id'], DEFAULT_GRADE[t['category']])

# ---------- 3. Safety class ----------
CLINICIAN = set(ids(103, 106, 107, 111, 112, 119, 122, 124, 132, 133))
CHECK_FIRST = set(ids(10, 47, 54, 56, 60, 86, 90, 92, 101, 102, 104, 105, 109, 113, 114, 115, 116, 117, 118,
                       123, 134, 135, 136, 158, 185))
for t in tips:
    t['safety'] = 'clinician' if t['id'] in CLINICIAN else 'check' if t['id'] in CHECK_FIRST else 'general'
    t['review'] = {'status': 'not-reviewed', 'by': None, 'date': None}

# ---------- 4. Sources: per-tip where one clear page exists ----------
TIP_SOURCES = {
    'ww-010': 'https://www.niddk.nih.gov/health-information/weight-management/just-enough-food-portions',
    'ww-014': 'https://fssai.gov.in/upload/uploadfiles/files/FAQ_Labelling_Display_23_06_2022.pdf',
    'ww-019': 'https://www.fda.gov/food/nutrition-facts-label/how-understand-and-use-nutrition-facts-label',
    'ww-047': 'https://www.sleepfoundation.org/nutrition/alcohol-and-sleep',
    'ww-054': 'https://www.nccih.nih.gov/health/melatonin-what-you-need-to-know',
    'ww-056': 'https://www.acponline.org/acp-newsroom/acp-recommends-cognitive-behavioral-therapy-as-initial-treatment-for-chronic-insomnia',
    'ww-060': 'https://111.wales.nhs.uk/Tirednessandfatigue/',
    'ww-079': 'https://www.epa.gov/lead/lead-safe-renovations-diyers',
    'ww-086': 'https://www.ema.europa.eu/en/news/updated-measures-pregnancy-prevention-during-retinoid-use',
    'ww-090': 'https://111.wales.nhs.uk/Hairdyereactions/',
    'ww-092': 'https://www.nccih.nih.gov/health/aromatherapy',
    'ww-101': 'https://ods.od.nih.gov/factsheets/WYNTK-Consumer/',
    'ww-102': 'https://www.fda.gov/food/dietary-supplements/information-consumers-using-dietary-supplements',
    'ww-103': 'https://ods.od.nih.gov/factsheets/Iron-Consumer/',
    'ww-104': 'https://ods.od.nih.gov/factsheets/VitaminB12-Consumer/',
    'ww-105': 'https://ods.od.nih.gov/factsheets/VitaminD-Consumer/',
    'ww-106': 'https://ods.od.nih.gov/factsheets/Potassium-Consumer/',
    'ww-107': 'https://www.nccih.nih.gov/health/tips/tips-how-herbs-can-interact-with-medicines',
    'ww-109': 'https://qualitymatters.usp.org/consumers-choose-quality-supplements-help-usp-verified-mark',
    'ww-111': 'https://www.nhs.uk/medicines/levothyroxine/',
    'ww-112': 'https://www.nhs.uk/medicines/anticoagulants/considerations/',
    'ww-113': 'https://medlineplus.gov/ency/patientinstructions/000883.htm',
    'ww-114': 'https://psnet.ahrq.gov/issue/oral-dosage-forms-should-not-be-crushed',
    'ww-115': 'https://ods.od.nih.gov/factsheets/Magnesium-Consumer/',
    'ww-116': 'https://ods.od.nih.gov/factsheets/VitaminA-Consumer/',
    'ww-117': 'https://www.nccih.nih.gov/health/probiotics-usefulness-and-safety',
    'ww-118': 'https://www.fda.gov/consumers/consumer-updates/grapefruit-juice-and-some-drugs-dont-mix',
    'ww-119': 'https://www.nia.nih.gov/health/medicines-and-medication-management/taking-medicines-safely-you-age',
    'ww-122': 'https://www.niddk.nih.gov/health-information/diagnostic-tests/a1c-test',
    'ww-123': 'https://www.cdc.gov/cholesterol/testing/index.html',
    'ww-124': 'https://www.heart.org/en/health-topics/cholesterol/genetic-conditions/lipoprotein-a',
    'ww-132': 'https://medlineplus.gov/lab-tests/ferritin-blood-test/',
    'ww-133': 'https://www.niddk.nih.gov/health-information/kidney-disease/chronic-kidney-disease-ckd/tests-diagnosis',
    'ww-134': 'https://www.nhlbi.nih.gov/health/anemia/causes',
    'ww-135': 'https://medlineplus.gov/lab-tests/how-to-understand-your-lab-results/',
    'ww-136': 'https://www.uspreventiveservicestaskforce.org/uspstf/recommendation/screening-for-prediabetes-and-type-2-diabetes',
    'ww-158': 'https://www.berkshirehealthcare.nhs.uk/advice/how-to-cut-back-on-alcohol-for-your-mental-health',
    'ww-161': 'https://www.airnow.gov/',
    'ww-183': 'https://www.cdc.gov/clean-hands/about/index.html',
    'ww-185': 'https://rethinkingdrinking.niaaa.nih.gov/thinking-about-change/tips-try',
}
exec(open('sources_more.py').read())
TIP_SOURCES.update(MORE)
for t in tips:
    if t['id'] in TIP_SOURCES:
        t['sources'] = list(dict.fromkeys([TIP_SOURCES[t['id']]] + t['sources']))
        t['sourceLevel'] = 'tip'
        t['sourceChecked'] = '2026-10-23'
    else:
        t['sourceLevel'] = 'topic'

# ---------- 5. Regional notes: specific or none ----------
NOTES = {
    'ww-001': {'IN': 'Use mustard, groundnut or rice-bran oil for part of the ghee in tadka.',
               'US': 'Use olive or canola oil in place of some butter.', 'GB': 'Use rapeseed or olive oil in place of some butter.'},
    'ww-002': {'IN': 'Try oats upma, poha with peanuts and vegetables, or fruit with curd.'},
    'ww-003': {'IN': 'Rajma, chana, moong and masoor all count.', 'GB': 'A tin of beans or chickpeas is a quick start.'},
    'ww-004': {'IN': 'Try millets such as jowar, bajra or ragi in place of some maida or white rice.'},
    'ww-005': {'IN': 'One katori of sabzi at lunch and dinner is enough to start.'},
    'ww-008': {'IN': 'Try unsweetened chaas or nimbu pani with little sugar in place of a cold drink.'},
    'ww-011': {'IN': 'Roasted chana or a small handful of peanuts can replace fried namkeen.'},
    'ww-015': {'IN': 'A katori of dal and a sabzi next to rice balances the plate.'},
    'ww-016': {'IN': 'Most packaged salt in India is iodized. Loose or rock salt may not be.'},
    'ww-021': {'IN': 'A short walk after dinner is an easy family habit.'},
    'ww-061': {'IN': 'Run the chimney during tadka and festival deep-frying.'},
    'ww-161': {'IN': "Use CPCB's Sameer app or your city's AQI board.", 'US': 'Use AirNow.gov.', 'GB': 'Use the UK-AIR service from Defra.'},
    'ww-166': {'IN': 'In the monsoon, empty coolers, flower pots and old tyres every week.'},
    'ww-168': {'IN': 'In heatwaves, avoid hard outdoor work in the hottest hours of the afternoon.',
               'US': 'Check National Weather Service heat advisories.'},
    'ww-172': {'IN': 'After lighting agarbatti or diyas, open a window when the air outside allows.'},
    'ww-177': {'IN': 'Some districts report arsenic or fluoride in groundwater. Check state water data.'},
    'ww-179': {'IN': 'Rinse produce in safe drinking water, not stored tank water.'},
    'ww-062': {'IN': 'Use a medium flame with nonstick tawas and kadais.'},
    'ww-077': {'IN': 'Check the LPG hose and regulator for cracks.'},
    'ww-164': {'IN': 'This also applies to bidi and hookah smoke.'},
}
for t in tips:
    if t['scope'] != 'GLOBAL':
        t['notes'] = {t['scope']: t['flavors'].get(t['scope'], '')}  # keep region-specific action
    else:
        t['notes'] = NOTES.get(t['id'], {})
    t.pop('flavors', None)

# ---------- 6. Trigger keys ----------
ADD_KEYS = {
    'prompt:cooking': ids(1, 3, 15, 18, 61, 62, 63, 64, 65, 66, 77, 193, 194),
    'prompt:grocery': ids(2, 4, 5, 6, 7, 8, 9, 11, 12, 13, 14, 16, 17, 19, 20, 189),
    'prompt:workout': ids(23, 24, 27, 30, 34, 37, 40, 58, 29),
    'prompt:desk': ids(22, 28, 38, 146, 152, 155, 181, 31),
    'prompt:cant_sleep': ids(41, 42, 43, 44, 45, 46, 47, 49, 50, 51, 52, 53, 54, 55, 56, 57, 60, 48),
    'prompt:low_mood': ids(141, 142, 143, 144, 145, 147, 148, 149, 150, 151, 153, 156, 157, 159, 160, 33),
    'prompt:cleaning': ids(70, 71, 72, 75, 76, 74, 67),
    'prompt:skincare': ids(81, 83, 84, 85, 88, 89, 91, 93, 94, 95, 97, 98, 99, 100),
    'prompt:supplement': ids(101, 102, 104, 105, 108, 109, 110, 113, 114, 116, 117, 120),
    'prompt:checkup': ids(121, 123, 125, 127, 128, 129, 130, 131, 135, 136, 138, 139, 140, 182, 200, 198, 89),
    'prompt:outdoors': ids(82, 96, 167, 168, 169, 26, 36, 25, 32),
    'routine:morning': ids(42, 41),
    'routine:meal_finished': ids(21, 50),
    'travel:long_trip': ids(196, 59),
    'calendar:appointment': ids(200, 110, 186, 130),
    'calendar:stressful_day': ids(145, 155),
    'calendar:social_connection': ids(151, 33),
    'calendar:late_night': ids(43, 47),
    'weather:monsoon': ids(166, 74, 170),
    'weather:cold_season': ids(67, 77, 178, 164, 172, 175),
    'weather:heat_warning': ids(168),
    'weather:wildfire_smoke': ids(180, 163),
    'environment:humidity': ids(175),
    'grocery:namkeen': ids(7, 11),
    'grocery:butter': ids(1),
    'commerce:herbal_supplement': ids(109),
    'commerce:essential_oil': ids(92),
    'commerce:resistance_band': ids(35, 23),
    'commerce:incense': ids(172),
    'commerce:hair_dye': ids(90),
    'commerce:sunscreen': ids(82, 96),
    'commerce:supplement': ids(120),
    'commerce:air_purifier': ids(163),
    'health:preventive_visit': ids(140),
}
for key, lst in ADD_KEYS.items():
    for i in lst:
        if key not in T[i]['triggerKeys']:
            T[i]['triggerKeys'].append(key)

# ---------- 7. Relationships: specific, reviewed-by-editor drafts ----------
E = [
 (1, 11, 'shared-goal', 'Both swap saturated fat or refined snacks for foods rich in unsaturated fat.'),
 (1, 123, 'shared-goal', 'Fat swaps are one lever on LDL. A lipid review shows where you stand.'),
 (2, 123, 'shared-goal', 'Some soluble fibers help lower LDL. Results vary by person.'),
 (2, 6, 'complements', 'Whole fruit at breakfast adds fiber that juice lacks.'),
 (3, 15, 'complements', 'Dal or beans next to rice adds protein and fiber to the same plate.'),
 (3, 189, 'complements', 'Keeping dried pulses on the grocery list makes bean meals easy.'),
 (4, 13, 'complements', 'Rotating grains is one part of eating a wider range of plants.'),
 (5, 13, 'complements', 'Two vegetable servings a day is an easy start on plant variety.'),
 (7, 19, 'complements', 'US labels list sodium per serving. Check servings before comparing.'),
 (7, 14, 'complements', 'Indian snack labels make the same sodium comparison possible.'),
 (7, 17, 'complements', 'UK traffic-light labels show salt at a glance.'),
 (8, 6, 'complements', 'Both cut sugar you drink without changing meals.'),
 (104, 20, 'complements', 'Fortified foods can be a B12 source in plant-based diets.'),
 (21, 136, 'shared-goal', 'A post-meal walk helps glucose. Screening tells you if glucose is a concern.'),
 (22, 38, 'complements', 'Breaking up sitting and changing posture work on the same long desk day.'),
 (22, 181, 'complements', 'A walking call is one easy way to break up sitting.'),
 (23, 37, 'reinforces', 'Strength gains depend on recovery between harder sessions.'),
 (23, 40, 'reinforces', 'The same strength habit matters more with age.'),
 (24, 40, 'complements', 'Balance and strength together help prevent falls as you age.'),
 (27, 34, 'complements', 'A warm-up prepares you for both cardio and strength work.'),
 (41, 42, 'complements', 'A fixed wake time and morning light both anchor your body clock.'),
 (42, 51, 'complements', 'Bright light in the morning and dim light at night work as a pair.'),
 (42, 59, 'complements', 'Light timing helps both daily sleep and time-zone changes.'),
 (43, 154, 'shared-goal', 'Caffeine can affect both sleep and restlessness.'),
 (47, 158, 'shared-goal', 'Alcohol can affect both sleep quality and mood.'),
 (47, 185, 'complements', 'Not using alcohol as a sleep aid is one step toward drinking less overall.'),
 (48, 137, 'reinforces', 'Noticing apnea signs leads to knowing when to get assessed.'),
 (55, 56, 'reinforces', 'Keeping the bed for sleep is one part of CBT-I.'),
 (60, 134, 'reinforces', 'Persistent tiredness can point to anemia. Testing finds the cause.'),
 (61, 161, 'complements', 'Kitchen ventilation depends on the air quality outside.'),
 (61, 77, 'complements', 'Gas burners and frying both add to kitchen air pollution.'),
 (62, 80, 'complements', 'Material safety depends on how you use an item, not blanket claims.'),
 (64, 80, 'complements', 'Microwave labels are one way to judge plastic by its use.'),
 (65, 66, 'complements', 'Clean boards and separate tools both stop cross-contamination.'),
 (193, 65, 'complements', 'Storage and clean prep cover different food safety risks.'),
 (193, 194, 'complements', 'Cooking to a safe temperature and chilling leftovers fast work together.'),
 (68, 177, 'depends-on', 'What to test for depends on known local risks.'),
 (69, 177, 'depends-on', 'Choose a filter for the contaminant your water actually has.'),
 (73, 174, 'complements', 'Local reports and official notices both guide what to do about tap water.'),
 (70, 72, 'complements', 'Using cleaners as directed includes never mixing them.'),
 (71, 84, 'shared-goal', 'Fragrance can trigger symptoms in cleaners and in skincare.'),
 (74, 175, 'complements', 'A dirty or overused humidifier can add to damp and mold.'),
 (77, 178, 'reinforces', 'Maintaining gas appliances lowers the risk of carbon monoxide.'),
 (79, 171, 'complements', 'Old paint is one of several household lead sources.'),
 (81, 90, 'complements', 'Patch tests apply to both new skincare and hair dye.'),
 (82, 169, 'shared-goal', 'Both cover sensible protection from UV.'),
 (82, 96, 'complements', 'Lips need sun protection too.'),
 (86, 116, 'shared-goal', 'Retinoids and high-dose vitamin A share pregnancy cautions.'),
 (101, 103, 'reinforces', 'Iron is a clear case where you confirm the need first.'),
 (102, 105, 'complements', 'Vitamin D often appears in several products at once.'),
 (102, 116, 'complements', 'Vitamin A can stack across multivitamins and other products.'),
 (106, 133, 'potential-conflict', 'Potassium products may need extra care in kidney disease.'),
 (107, 112, 'potential-conflict', 'Some herbs change bleeding risk with anticoagulants. This is a review flag, not a diagnosis.'),
 (111, 103, 'potential-conflict', 'Iron can reduce absorption of some thyroid medicines.'),
 (110, 186, 'reinforces', 'Keeping the list current matters only if you can find it at an appointment.'),
 (110, 200, 'complements', 'Bring both your medication list and your questions to a visit.'),
 (121, 126, 'complements', 'A validated cuff and good technique give readings you can trust.'),
 (126, 138, 'complements', 'Accurate home readings make trends meaningful.'),
 (121, 123, 'shared-goal', 'Blood pressure and lipids add different information to heart risk.'),
 (127, 191, 'complements', 'Routine vaccines and travel vaccines are best reviewed together.'),
 (140, 182, 'reinforces', 'A reminder keeps the annual checklist from slipping.'),
 (130, 129, 'depends-on', 'Family history can change when colorectal screening should start.'),
 (141, 151, 'complements', 'A walk with someone combines an outdoor pause with connection.'),
 (142, 157, 'complements', 'Daily contact and a regular group both ease loneliness.'),
 (143, 146, 'complements', 'Slow breathing is one way to use a short break.'),
 (145, 160, 'reinforces', 'Writing worries down helps. Lasting distress needs more support.'),
 (148, 160, 'reinforces', 'Noticing a lasting change in mood is the first step to getting help.'),
 (156, 188, 'shared-goal', 'Both say: start small and change one thing at a time.'),
 (159, 156, 'complements', 'Small goals and kindness after a slip help habits last.'),
 (161, 162, 'complements', 'Checking AQI tells you when to move exercise indoors.'),
 (162, 163, 'complements', 'Moving indoors helps more when indoor air is filtered.'),
 (163, 165, 'complements', 'A correctly sized purifier is a key tool during smoke events.'),
 (165, 180, 'complements', 'A well-fitted respirator helps when you must go out in smoke.'),
 (166, 170, 'shared-goal', 'Both reduce health risks from standing water.'),
 (168, 196, 'complements', 'Heat plans matter on long trips too.'),
 (59, 196, 'complements', 'Sleep timing is one part of a healthy travel routine.'),
 (191, 196, 'complements', 'Vaccines and day-to-day routines are both travel preparation.'),
 (197, 198, 'reinforces', 'Protecting hearing and acting on changes go together.'),
 (183, 65, 'complements', 'Clean hands and clean boards both stop germs spreading in the kitchen.'),
]
edges = []
for a, b, typ, why in E:
    a, b = 'ww-%03d' % a, 'ww-%03d' % b
    assert a in T and b in T, (a, b)
    edges.append({'a': a, 'b': b, 'type': typ, 'why': why})

# ---------- 8. Hindi sample ----------
HI = {
 'ww-001': ('घी या मक्खन का कुछ हिस्सा तेल से बदलें', 'रोज़ के खाने में घी या मक्खन का कुछ हिस्सा सरसों, मूंगफली या दूसरे असंतृप्त तेल से बदलें', 'संतृप्त वसा की जगह असंतृप्त वसा लेने से LDL कोलेस्ट्रॉल कम हो सकता है'),
 'ww-003': ('दाल और बीन्स ज़्यादा खाएँ', 'हफ़्ते में एक भारी या मैदे वाले भोजन की जगह दाल, राजमा या चना लें', 'दालें फ़ाइबर, प्रोटीन और खनिज देती हैं'),
 'ww-005': ('दो भोजन में सब्ज़ी जोड़ें', 'दोपहर और रात के खाने में एक सब्ज़ी रखें', 'अलग-अलग सब्ज़ियों से पोषक तत्व और फ़ाइबर बढ़ते हैं'),
 'ww-008': ('रोज़ के पेय बिना चीनी के चुनें', 'एक मीठे पेय की जगह पानी, छाछ या बिना चीनी की चाय लें', 'बिना बड़ा बदलाव किए अतिरिक्त चीनी कम होती है'),
 'ww-021': ('खाने के बाद टहलें', 'खाने के बाद दस मिनट आराम से टहलें', 'खाने के बाद हल्की चहल-क़दमी से ब्लड शुगर का उछाल कम हो सकता है'),
 'ww-041': ('रोज़ लगभग एक ही समय पर उठें', 'ज़्यादातर दिनों में एक ही समय पर उठें', 'नियमित समय नींद की लय को स्थिर रखता है'),
 'ww-061': ('तलते समय हवा आने-जाने दें', 'चिमनी या एग्ज़ॉस्ट चलाएँ, या खिड़की खोलें', 'खाना पकाने से घर के अंदर धुआँ और महीन कण बनते हैं'),
 'ww-161': ('स्थानीय AQI देखें', 'बाहर मेहनत वाला काम करने से पहले भरोसेमंद AQI स्रोत देखें', 'प्रदूषण के महीन कण साँस और दिल की बीमारी को बढ़ा सकते हैं'),
 'ww-166': ('मच्छरों के पनपने की जगहें हटाएँ', 'घर के आसपास जमा पानी हटाएँ', 'जमा पानी हटाने से मच्छर कम पनपते हैं'),
 'ww-183': ('ज़रूरी मौक़ों पर हाथ धोएँ', 'शौचालय के बाद और खाना बनाने से पहले साबुन से हाथ धोएँ', 'हाथ धोने से कीटाणु कम फैलते हैं'),
}
for k, (a, b, c) in HI.items():
    T[k]['hi'] = {'title': a, 'action': b, 'why': c}

# ---------- 9. Sponsor criteria (demo, topic-only) ----------
SPONSOR = {
 'ww-126': ('Cuffwell monitors', 'Only cuffs listed on an independent validation register.'),
 'ww-163': ('ClearRoom purifiers', 'Only purifiers that publish a tested CADR for a stated room size.'),
 'ww-069': ('PureTap filters', 'Only filters certified for a named contaminant.'),
 'ww-082': ('Sunday Shade sunscreen', 'Only products labelled broad-spectrum.'),
 'ww-194': ('TrueTemp thermometers', 'Only probe thermometers with a stated accuracy range.'),
 'ww-184': ('Gumline floss', 'Any interdental product. No health claims beyond plaque removal.'),
}
for k, (n, c) in SPONSOR.items():
    T[k]['sponsor'] = {'name': n, 'criteria': c}

# ---------- 10. Moments ----------
MOMENTS = [
 # environment
 ('env-aqi', 'environment', 'Air quality is poor today', 'weather:poor_air_quality', 'The air outside is poor today. Here is one way to protect your lungs.'),
 ('env-heat', 'environment', 'Heatwave warning', 'weather:heat_warning', 'It is very hot today. Here is one thing worth knowing.'),
 ('env-uv', 'environment', 'High UV today', 'weather:high_uv', 'The sun is strong today. Here is a simple way to protect your skin.'),
 ('env-monsoon', 'environment', 'Monsoon week', 'weather:monsoon', 'Heavy rain is here. Standing water brings its own risks.'),
 ('env-flood', 'environment', 'Local flooding', 'weather:flood', 'There is flooding nearby. Here is how to stay safe around flood water.'),
 ('env-smoke', 'environment', 'Smoke in the air', 'weather:wildfire_smoke', 'There is smoke in the air. Here is how to cut what you breathe in.'),
 ('env-damp', 'environment', 'Damp, humid week', 'environment:humidity', 'It is a damp week. Here is how to keep mold away.'),
 ('env-cold', 'environment', 'Windows-shut season', 'weather:cold_season', 'With windows shut, indoor air matters more.'),
 # calendar
 ('cal-flight', 'calendar', 'Flight across time zones', 'travel:time_zone', 'You have a long flight coming up. Here is how to ease jet lag.'),
 ('cal-intl', 'calendar', 'International trip next month', 'travel:international_trip', 'You have a trip abroad coming up. Some prep needs lead time.'),
 ('cal-long', 'calendar', 'Long road or rail trip', 'travel:long_trip', 'A long trip is on your calendar. A little planning helps.'),
 ('cal-desk', 'calendar', 'Back-to-back meetings', 'calendar:desk_day', 'Your day is full of meetings. Here is an easy way to move a little.'),
 ('cal-appt', 'calendar', "Doctor's appointment this week", 'calendar:appointment', 'You have an appointment soon. A little prep makes it count.'),
 ('cal-checkup', 'calendar', 'Annual check-up booked', 'health:preventive_visit', 'Your check-up is booked. Here is something worth asking about.'),
 ('cal-late', 'calendar', 'Late-night event', 'calendar:late_night', 'You have a late night ahead. Here is how to protect your sleep.'),
 ('cal-stress', 'calendar', 'Big deadline today', 'calendar:stressful_day', 'Today looks demanding. Here is a small thing that can help.'),
 ('cal-social', 'calendar', 'Dinner with friends', 'calendar:social_connection', 'You have plans with friends. Here is a nice way to add to it.'),
 # quick check-in
 ('p-cook', 'prompt', "I'm cooking", 'prompt:cooking', 'You are cooking. Here is one useful kitchen tip.'),
 ('p-ate', 'prompt', 'I just ate', 'routine:meal_finished', 'You just ate. Here is an easy next step.'),
 ('p-shop', 'prompt', "I'm grocery shopping", 'prompt:grocery', 'You are shopping. Here is one thing to look for.'),
 ('p-work', 'prompt', 'I worked out', 'prompt:workout', 'Nice work. Here is something to help your training.'),
 ('p-desk', 'prompt', "I've been sitting all day", 'prompt:desk', 'Long day at the desk. Here is a small fix.'),
 ('p-sleep', 'prompt', "I'm not sleeping well", 'prompt:cant_sleep', 'Sleep has been hard. Here is one thing to try.'),
 ('p-low', 'prompt', 'I feel stressed or low', 'prompt:low_mood', 'Thank you for telling us. Here is one small thing that may help.'),
 ('p-clean', 'prompt', "I'm cleaning the house", 'prompt:cleaning', 'You are cleaning. Here is how to do it safely.'),
 ('p-skin', 'prompt', "I'm sorting my skincare", 'prompt:skincare', 'You are sorting your skincare. Here is one tip.'),
 ('p-supp', 'prompt', "I'm thinking about supplements", 'prompt:supplement', 'Before you buy, here is one thing to check.'),
 ('p-check', 'prompt', 'I want a health check', 'prompt:checkup', 'Good idea. Here is one check worth knowing about.'),
 ('p-out', 'prompt', "I'm heading outdoors", 'prompt:outdoors', 'You are heading out. Here is one thing to keep in mind.'),
 ('p-morning', 'prompt', 'Good morning', 'routine:morning', 'Good morning. Here is a simple way to start the day.'),
]
moments = [{'id': a, 'source': b, 'name': c, 'event': d, 'friendly': e} for a, b, c, d, e in MOMENTS]
for m in moments:
    if m['id'] == 'p-low': m['support'] = True

PRODUCTS = [
 ('nonstick', 'Nonstick pan or tawa', ['nonstick', 'non-stick', 'non stick', 'tawa', 'frying pan', 'skillet'], 'commerce:nonstick_pan', 'your new pan', 'Nonstick tawa 28 cm'),
 ('purifier', 'Air purifier', ['air purifier', 'purifier', 'hepa'], 'commerce:air_purifier', 'your new air purifier', 'HEPA air purifier'),
 ('lentils', 'Lentils or beans', ['dal', 'lentil', 'rajma', 'chana', 'beans', 'chickpea', 'moong', 'masoor'], 'grocery:lentils', 'the lentils in your basket', 'Toor dal 1 kg'),
 ('soda', 'Soft drinks', ['soda', 'cola', 'soft drink', 'cold drink', 'pop', 'fizzy'], 'grocery:soda', 'your drinks order', 'Cola 6-pack'),
 ('namkeen', 'Packaged snacks', ['namkeen', 'bhujia', 'chips', 'crisps', 'snack', 'mixture'], 'grocery:namkeen', 'your snacks', 'Masala namkeen 200 g'),
 ('juice', 'Fruit juice', ['juice'], 'grocery:juice', 'the juice in your basket', None),
 ('ghee', 'Ghee or butter', ['ghee', 'butter'], 'grocery:butter', 'your ghee or butter', 'Desi ghee 500 ml'),
 ('oats', 'Oats', ['oats', 'oatmeal', 'porridge'], 'grocery:oats', 'your oats', 'Rolled oats 1 kg'),
 ('vitd', 'Vitamin D', ['vitamin d', 'vit d', 'd3', 'cholecalciferol'], 'commerce:vitamin_d', 'your vitamin D', 'Vitamin D3 capsules'),
 ('multi', 'Multivitamin', ['multivitamin', 'multi-vitamin', 'vitamins', 'supplements'], 'commerce:supplement', 'your supplement', None),
 ('herbal', 'Herbal supplement', ['ashwagandha', 'herbal', 'st john', 'turmeric capsule', 'ginkgo', 'giloy'], 'commerce:herbal_supplement', 'your herbal supplement', 'Ashwagandha capsules'),
 ('potassium', 'Low-sodium salt', ['potassium', 'salt substitute', 'low sodium salt', 'lo-salt', 'low-sodium salt'], 'commerce:potassium_supplement', 'your low-sodium salt', 'Low-sodium salt 1 kg'),
 ('magnesium', 'Magnesium', ['magnesium'], 'commerce:magnesium', 'your magnesium', None),
 ('probiotic', 'Probiotic', ['probiotic'], 'commerce:probiotic', 'your probiotic', None),
 ('grapefruit', 'Grapefruit', ['grapefruit'], 'grocery:grapefruit', 'the grapefruit in your basket', None),
 ('cleaner', 'Household cleaners', ['bleach', 'cleaner', 'disinfectant', 'phenyl', 'toilet cleaner', 'detergent'], 'commerce:cleaning_product', 'your cleaning products', 'Bleach toilet cleaner'),
 ('humidifier', 'Humidifier', ['humidifier'], 'commerce:humidifier', 'your new humidifier', None),
 ('filter', 'Water filter', ['water filter', 'ro purifier', 'ro system', 'filter jug', 'filter cartridge'], 'commerce:water_filter', 'your water filter', None),
 ('skincare', 'Skincare product', ['serum', 'face cream', 'face wash', 'skincare', 'cleanser', 'toner'], 'commerce:skincare', 'your new skincare', None),
 ('moisturizer', 'Moisturizer', ['moisturizer', 'moisturiser', 'lotion'], 'commerce:moisturizer', 'your moisturizer', None),
 ('sunscreen', 'Sunscreen', ['sunscreen', 'spf', 'sunblock'], 'commerce:sunscreen', 'your sunscreen', 'Sunscreen SPF 50'),
 ('retinol', 'Retinol or retinoid', ['retinol', 'retinoid', 'tretinoin', 'adapalene'], 'commerce:retinoid', 'your retinol product', None),
 ('hairdye', 'Hair dye', ['hair dye', 'hair colour', 'hair color', 'henna'], 'commerce:hair_dye', 'your hair colour', 'Hair colour kit'),
 ('essential', 'Essential oil', ['essential oil', 'tea tree', 'eucalyptus oil'], 'commerce:essential_oil', 'your essential oil', None),
 ('bp', 'Blood-pressure monitor', ['blood pressure', 'bp monitor', 'bp machine', 'sphygmomanometer'], 'commerce:blood_pressure_monitor', 'your new BP monitor', 'Upper-arm BP monitor'),
 ('coffee', 'Coffee', ['coffee', 'latte', 'espresso', 'cappuccino'], 'commerce:coffee', 'your coffee', None),
 ('toothpaste', 'Toothpaste', ['toothpaste'], 'commerce:toothpaste', 'your toothpaste', None),
 ('floss', 'Floss', ['floss', 'interdental'], 'commerce:floss', 'your floss', None),
 ('shoes', 'Walking shoes', ['walking shoes', 'sneakers', 'trainers', 'running shoes'], 'commerce:walking_shoes', 'your new shoes', None),
 ('thermo', 'Meat thermometer', ['meat thermometer', 'probe thermometer', 'food thermometer'], 'commerce:meat_thermometer', 'your thermometer', None),
 ('container', 'Plastic food containers', ['tupperware', 'container', 'lunch box', 'tiffin'], 'commerce:plastic_container', 'your containers', 'Plastic lunch box set'),
 ('band', 'Resistance band or weights', ['resistance band', 'dumbbell', 'kettlebell', 'weights'], 'commerce:resistance_band', 'your new gear', None),
 ('tools', 'Power tools', ['drill', 'power tool', 'grinder', 'saw'], 'commerce:power_tools', 'your new tools', None),
 ('incense', 'Incense', ['incense', 'agarbatti', 'dhoop'], 'commerce:incense', 'your incense', 'Agarbatti pack'),
 ('gasstove', 'Gas stove', ['gas stove', 'gas hob', 'lpg', 'burner'], 'commerce:gas_stove', 'your gas stove', None),
 ('board', 'Cutting board', ['cutting board', 'chopping board'], 'commerce:cutting_board', 'your cutting board', None),
 ('notebook', 'Decorative notebook', ['notebook', 'diary', 'journal'], 'commerce:decorative_notebook', 'your notebook', 'Decorative notebook'),
]
products = [{'id': a, 'name': b, 'keywords': c, 'event': d, 'object': e, 'scan': f} for a, b, c, d, e, f in PRODUCTS]

# Agent scenarios kept from V2
agent_scen = [{'id': s['id'], 'name': s['name'], 'event': s['event'], 'detail': s['detail'], 'kind': s['kind']} for s in scen]

# ---------- coverage check ----------
events = {m['event'] for m in moments} | {p['event'] for p in products} | {s['event'] for s in agent_scen}
reach = [t['id'] for t in tips if t['safety'] != 'clinician' and any(k in events for k in t['triggerKeys'])]
print('tips', len(tips), 'reachable', len(reach), 'edges', len(edges), 'moments', len(moments), 'products', len(products))
bad = [t['id'] for t in tips if any(',' in x for x in t['tags'] + t['concepts'])]
print('bad tags', bad)

KNOW = {
 'Food & nutrition':['way to eat well','ways to eat well'],'Movement & mobility':['way to move more','ways to move more'],
 'Sleep & recovery':['way to sleep better','ways to sleep better'],'Household & cookware':['way to keep your kitchen and home safe','ways to keep your kitchen and home safe'],
 'Skincare & personal care':['way to care for your skin','ways to care for your skin'],'Supplements & medication':['check before you take a supplement','checks before you take a supplement'],
 'Prevention & tests':['test or check worth knowing','tests and checks worth knowing'],'Mental wellbeing':['way to look after your mind','ways to look after your mind'],
 'Air, water & environment':['way to protect yourself from air and water risks','ways to protect yourself from air and water risks'],'Everyday health':['everyday health habit','everyday health habits']}
cats=[]
for c in CAT_TAG:
    first=next(t for t in tips if t['category']==c)
    cats.append({'name':c,'tag':CAT_TAG[c],'concept':CAT_CONCEPT[c],'defaultGrade':DEFAULT_GRADE[c],'defaultTimeline':first['timeline'],'know':KNOW[c]})
for t in tips:
    t['status']='live'; t['added']='2026-01-01'
content = {'schemaVersion': 1, 'contentVersion': 202610230001,
  'REGIONS': ['US','IN','GB','OTHER'], 'CATEGORIES': cats,
  'TIPS': tips, 'EDGES': edges, 'MOMENTS': moments, 'PRODUCTS': products, 'AGENT_SCENARIOS': agent_scen}
json.dump(content, open('wellwise-content.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('tip-level sources:', sum(t['sourceLevel']=='tip' for t in tips))
