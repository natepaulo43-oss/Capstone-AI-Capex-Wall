const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const {execFileSync} = require('node:child_process');

const data = JSON.parse(execFileSync('python', ['-c', `import csv,json
print(json.dumps([list(csv.DictReader(open(p,encoding='utf-8-sig',newline=''))) for p in ['data/frontier_ai_models.csv','data/ml_hardware.csv']]))`], {encoding:'utf8'}));
const context = vm.createContext({document:{getElementById:()=>({}),addEventListener:()=>{}},console});
vm.runInContext(fs.readFileSync('app.js','utf8'), context);
context.rows=data;
const results=vm.runInContext(`(()=>{
const models=processModels(rows[0]),hardware=processHardware(rows[1]);
const index=indexedGrowth(models,hardware);
return {models,hardware,index,clusters:acceleratorObservations(models),
numbers:[null,undefined,'',' ','3xyz','Infinity','1,2','NaN'].map(parseNum),
weights:[null,undefined,'',' ','unrecognized','No','Yes','Partially'].map(v=>isOpenWeights({'Open model weights?':v})),
invalidDate:parseDate('2025-02-30'),sameLog:logScale(1,1,0,100)(1),
primaryDomain:getPrimaryDomain('Unknown,Language'),unknownFrontier:isFrontier({}),
synthetic:indexedGrowth([{frontier:true,date:parseDate('2016-01-01'),flop:2},{frontier:true,date:parseDate('2018-01-01'),flop:10},{frontier:false,date:parseDate('2018-01-01'),flop:1000}], [{releaseDate:parseDate('2016-01-01'),fp16:4},{releaseDate:parseDate('2018-01-01'),fp16:12}]),
noBase:indexedGrowth([],hardware),
noInferredClusters:acceleratorObservations([{frontier:true,date:parseDate('2025-01-01'),quantity:180,trainingHardware:'CPU',dataCenter:''}]).length,
countries:[normalizeCountry('China,China'),normalizeCountry('China,Singapore'),normalizeCountry('Australia')]
};})()`,context);
assert.equal(results.models.length,137);
assert.equal(results.hardware.length,175);
assert(results.models.every(m=>m.frontier));
assert(results.numbers.every(v=>v===null));
assert.deepEqual(Array.from(results.weights),['unknown','unknown','unknown','unknown','unknown','closed','open','partial']);
assert.equal(results.invalidDate,null);
assert.equal(results.sameLog,50);
assert.equal(results.primaryDomain,'Language');
assert.equal(results.unknownFrontier,null);
assert.equal(results.models.filter(m=>m.openWeights==='unknown').length,63);
assert.equal(results.models.find(m=>m.name==='GPT-4.5').confidence,'Likely');
assert.equal(results.models.find(m=>m.name==='Grok 4').confidence,'Speculative');
assert.equal(results.clusters.find(m=>m.name==='Grok 3').quantity,80000);
assert.equal(results.clusters.find(m=>m.name==='Grok 4').quantity,200000);
assert.equal(results.noInferredClusters,0);
assert.equal(results.index.baseYear,2017);
assert.equal(results.index.models[0].value,1);
assert.equal(results.index.hardware[0].value,1);
assert.equal(results.synthetic.baseYear,2016);
assert.equal(results.synthetic.models[1].value,5);
assert.equal(results.synthetic.hardware[1].value,3);
assert.equal(results.synthetic.models.length,2); // no fabricated 2017 value
assert.equal(results.noBase,null);
assert.deepEqual(Array.from(results.countries),['China','Multiple countries','Australia']);
assert.equal(results.index.models.at(-1).year,2025);
assert.equal(results.index.hardware.at(-1).year,2026);
const ui=fs.readFileSync('index.html','utf8')+fs.readFileSync('app.js','utf8');
assert(!/[\u2014]|&mdash;|ChatGPT era|cluster size multiplier|95%|2\.0.{0,8}3\.1/.test(ui));
assert(ui.includes('ChatGPT launches (Nov 2022)'));
assert(!ui.includes('ratioByYear'));
assert(!ui.includes('minimum cluster size required'));
console.log(JSON.stringify({status:'PASS',models:results.models.length,hardware:results.hardware.length,clusters:results.clusters.length,unknown:63,baseYear:results.index.baseYear,baseModel:results.index.models[0].row.name,baseModelFLOP:results.index.models[0].rawValue,baseChip:results.index.hardware[0].row.name,baseChipThroughput:results.index.hardware[0].rawValue},null,2));
if(process.argv.includes('--browser'))require('./browser-test.cjs');
