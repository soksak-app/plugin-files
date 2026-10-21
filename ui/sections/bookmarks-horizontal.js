// 가로 북마크는 같은 프로젝트 상태의 모든 경로와 삭제 명령을 가로 목록으로 표시한다.
import { drawList } from '@soksak/plugin-api';

export function mount(root, context) {
  if(context.orientation !== 'horizontal') throw new Error('horizontal bookmarks require horizontal orientation');
  const list=document.createElement('ul');
  Object.assign(list.style,{display:'flex',alignItems:'center',gap:'12px',height:'100%',overflowX:'auto'});
  root.append(list);
  let drawn;
  const stop=context.status('files.bookmarks',(value,source)=>{
    const key=JSON.stringify([value,source]);if(key===drawn)return;drawn=key;
    const listValue=value?.elements?.find(element=>element.kind==='list');
    if(!listValue){list.textContent='프로젝트 없음';return;}
    if(listValue.items.length===0){list.textContent=listValue.empty;return;}
    // Keep each bookmark control in the document across status updates.
    drawList(list,listValue.items,{key:item=>item.key,update:()=>{},create:entry=>{
      const item=document.createElement('li');Object.assign(item.style,{display:'flex',gap:'6px',alignItems:'center',flex:'0 0 auto'});
      const name=document.createElement('span');name.textContent=entry.label;
      const remove=document.createElement('button');remove.type='button';remove.textContent='삭제';
      item.append(name,context.bind(remove,entry.command,entry.params));return item;
    }});
  });
  return {dispose(){stop();list.remove();}};
}
