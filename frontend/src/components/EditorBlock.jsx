import React from 'react';

const EditorBlock = ({ block, onFocus, fontFamily, onChange }) => {
  const isLocked = block.status === 'locked';
  const isEditing = block.status === 'editing';
  const isError = block.status === 'error';

  return (
    <div className="block-wrapper">
        <div className={`block-content ${isEditing ? 'block-editing' : ''} ${isLocked ? 'block-locked' : ''} ${isError ? 'block-error' : ''}`}>

        <div
            contentEditable={block.status !== 'locked'}
            suppressContentEditableWarning={true}
            className="block-contenteditable"
            style={{
                fontFamily: fontFamily,
                color: 'inherit',
                minHeight: '1.5em',
                outline: 'none',
                whiteSpace: 'pre-wrap',
               
            }}
            onFocus={() => block.status !== 'locked' && onFocus(block.id)}
            onInput={(e) => onChange(block.id, e.currentTarget.innerHTML)}
            dangerouslySetInnerHTML={{ __html: block.content }} 
        />
        
        {!isLocked && (
          <div style={{ fontSize: '9px', color: '#94a3b8', textAlign: 'right', marginTop: '4px', fontFamily: 'monospace' }}>
            v.{block?.version || 1} | Hash: {block?.lastHash?.substring(0, 8) || "00000000"}...
          </div>
        )}
      </div>
    </div>
  );
};

export default EditorBlock;