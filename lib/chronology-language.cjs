// User-facing Chinese fields only. URLs, stable IDs and original-name search
// metadata are intentionally not translated, and must not be rendered as prose.
function auditChronologyLanguage(data) {
  const issues=[];
  const check=(value,path)=>{if(typeof value==='string'&&/[A-Za-z가-힣ぁ-んァ-ン]/u.test(value))issues.push(`${path}: ${value}`);};
  for(const key of ['title','description','calendarNote','terminologyNote'])check(data[key],key);
  for(const [group,fields] of [['works',['title']],['eras',['title','calendar','note']],['sources',['title','kind','scope','family']],['events',['title','summary','detail','note','year','day']],['terms',['title','kind','note']]])
    for(const entry of data[group]||[])for(const key of fields)check(entry[key],`${group}.${entry.id}.${key}`);
  for(const event of data.events||[])for(const [index,citation] of (event.citations||[]).entries())for(const key of ['locator','note'])check(citation[key],`events.${event.id}.citations.${index}.${key}`);
  for(const term of data.terms||[])for(const alias of term.aliases||[])check(alias,`terms.${term.id}.aliases`);
  return issues;
}
module.exports={auditChronologyLanguage};
