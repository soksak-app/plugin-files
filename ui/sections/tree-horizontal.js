// 가로 파일 섹션은 경로를 한 줄로 나열하고 같은 파일 상태와 선언된 명령을 사용한다.
import { drawList } from '@soksak/plugin-api';
import { openFailure } from './open-failure.js';

export function mount(root, context) {
  if (context.orientation !== 'horizontal') throw new Error('horizontal file tree requires horizontal orientation');
  const box = document.createElement('div');
  Object.assign(box.style,{display:'flex',flexDirection:'column',height:'100%',minHeight:'0'});
  const header = document.createElement('div');
  Object.assign(header.style,{display:'flex',alignItems:'center',gap:'8px',flex:'0 0 28px',minWidth:'0'});
  const title = document.createElement('span');
  Object.assign(title.style,{flex:'1 1 auto',minWidth:'0',whiteSpace:'nowrap',overflowX:'auto'});
  const refresh = document.createElement('button');refresh.type='button';refresh.textContent='새로고침';
  // The failure to open a file is shown beside the title and not in the error display of the main document.
  const notice = document.createElement('span');notice.hidden=true;
  Object.assign(notice.style,{flex:'0 1 auto',color:'var(--muted)',whiteSpace:'nowrap'});
  header.append(title,notice,context.bind(refresh,'files.refresh',{}));
  const paths = document.createElement('div');
  Object.assign(paths.style,{display:'flex',alignItems:'center',gap:'8px',overflowX:'auto',minHeight:'0',flex:'1 1 auto'});
  box.append(header,paths);root.append(box);
  let selection = null;
  let rows = [];
  const controls = new Map();
  const gitMarkers = new Map();
  const openFailed = (error) => {
    reportError(error);
    box.dispatchEvent(new CustomEvent('files-open-failed',{detail:{error:openFailure(error)}}));
  };
  context.bind(box,'files.open.failed',(event)=>({error:event.detail.error}),{event:'files-open-failed'});
  const applySelection = () => {
    for (const [path,button] of controls) {
      const selected = path === selection;
      button.dataset.selected=String(selected);
      button.style.background=selected?'var(--chip-sel)':'transparent';
    }
  };
  const applyGit = () => {
    for (const [path,label] of gitMarkers) label.textContent=rows.find(row=>row.path===path)?.detail??'';
  };
  const flatten = (nodes, depth = 0) => nodes.flatMap((node) => {
    if (typeof node.params?.path !== "string") throw new Error("files.tree node has no path parameter");
    const row={path:node.params.path,name:node.label,directory:node.branch===true,depth,expanded:node.expanded===true,selected:node.selected===true,detail:node.detail};
    return [row,...(node.children?flatten(node.children,depth+1):[])];
  });
  const stopTree = context.status('files.tree',(value)=>{
    controls.clear();gitMarkers.clear();
    const declared=value?.elements?.find(element=>element.kind==='tree');
    const lines=value?.elements?.filter(element=>element.kind==='status-line')??[];
    const project=lines.find(element=>element.key==='project');
    const notice=lines.find(element=>element.key!=='project');
    if(project&&project.text!=='프로젝트 없음'){
      title.textContent=project.text.split(/[\\/]/).filter(Boolean).at(-1)??project.text;
      title.title=project.text;
    }else{title.textContent=project?.text??'프로젝트 없음';title.title='';}
    if(notice){notice.textContent=notice.text??'';notice.hidden=notice.textContent==='';}
    if(!declared){rows=[];paths.textContent=title.textContent;return;}
    rows=flatten(declared.nodes);
    selection=rows.find(row=>row.selected)?.path??null;
    if(rows.length===0){paths.textContent=declared.empty;return;}
    // 항목마다 그 조작 요소를 문서에 둔다. 새 항목만 만들고 펼침 상태는 제자리에서 고친다(core docs/spec/exposure.md).
    drawList(paths,rows,{
      key:(entry)=>`${entry.directory?'d':'f'}:${entry.path}`,
      create:(entry)=>{
        const item=document.createElement('div');Object.assign(item.style,{display:'flex',alignItems:'center',gap:'4px',flex:'0 0 auto'});
        if(entry.directory) {
          const toggle=document.createElement('button');toggle.type='button';toggle.dataset.part='toggle';
          item.append(context.bind(toggle,'files.tree.toggle',{path:entry.path}));
        }
        const select=document.createElement('button');select.type='button';select.textContent=entry.path;select.dataset.part='select';
        item.append(context.bind(select,'files.select',{path:entry.path}));
        // A double click on a file opens it in the plugin that declares its extension.
        if(!entry.directory) context.bind(select,'core.file.open',{path:entry.path},{event:'dblclick',failed:openFailed});
        const marker=document.createElement('span');marker.dataset.part='git';item.append(marker);
        if(!entry.directory) {
          const bookmark=document.createElement('button');bookmark.type='button';bookmark.textContent='북마크';
          item.append(context.bind(bookmark,'files.bookmarks.add',{path:entry.path}));
        }
        return item;
      },
      update:(item,entry)=>{
        const toggle=item.querySelector('[data-part="toggle"]');
        if(toggle) toggle.textContent=entry.expanded?'접기':'펼치기';
        controls.set(entry.path,item.querySelector('[data-part="select"]'));
        gitMarkers.set(entry.path,item.querySelector('[data-part="git"]'));
      },
    });
    applySelection();applyGit();
  });
  return {dispose(){stopTree();box.remove();}};
}
