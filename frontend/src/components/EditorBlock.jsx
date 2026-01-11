import React, { useEffect, useRef } from 'react';

const EditorBlock = ({ block, onFocus, fontFamily, onChange }) => {
  const ref = useRef(null);
  const isLocked = block.status === 'locked';
  const isEditing = block.status === 'editing';
  const isError = block.status === 'error';

   useEffect(() => {
    if (ref.current && ref.current.innerHTML !== block.content) {
      ref.current.innerHTML = block.content;
    }
  }, [block.id]);

  const handleInput = () => {
    onChange(block.id, ref.current.innerHTML);
  };

  // Hàm xử lý click vào nội dung block
  const handleBlockClick = (e) => {
    const target = e.target;

    // 1. Xử lý click vào Link
    const link = target.closest('a');
    if (link) {
      window.open(link.href, '_blank', 'noopener,noreferrer');
      return;
    }

    // 2. Xử lý click vào Ảnh
    if (target.tagName === 'IMG') {
      e.preventDefault();
      e.stopPropagation();

      const selection = window.getSelection();
      const range = document.createRange();
      
      // Ép trình duyệt chọn toàn bộ node ảnh
      range.selectNode(target);
      selection.removeAllRanges();
      selection.addRange(range);

      document
        .querySelectorAll('.editor-image.selected')
        .forEach(img => img.classList.remove('selected'));
    }
  };

 const handleKeyDown = (e) => {
     if (e.key !== 'Backspace' && e.key !== 'Delete') return;

    const selection = window.getSelection();
    if (!selection.rangeCount) return;

    const range = selection.getRangeAt(0);

    // TRƯỜNG HỢP 1: ĐANG SELECT ẢNH
    if (
      range.startContainer.nodeType === Node.ELEMENT_NODE &&
      range.startContainer.tagName === 'IMG'
    ) {
      e.preventDefault();
      range.startContainer.remove();
      onChange(block.id, e.currentTarget.innerHTML);
      return;
    }

    // TRƯỜNG HỢP 2: CARET ĐỨNG TRƯỚC / SAU ẢNH
    const container = range.startContainer;
    const offset = range.startOffset;

    if (container.nodeType === Node.TEXT_NODE) {
      const parent = container.parentNode;
      const nodeBefore = parent.childNodes[offset - 1];
      const nodeAfter = parent.childNodes[offset];

      const img = nodeBefore?.tagName === 'IMG'
        ? nodeBefore
        : nodeAfter?.tagName === 'IMG'
        ? nodeAfter
        : null;

      if (img) {
        e.preventDefault();
        img.remove();
        onChange(block.id, e.currentTarget.innerHTML);
      }
    }
  };

  return (
    <div className="block-wrapper">
        <div className={`block-content ${isEditing ? 'block-editing' : ''} ${isLocked ? 'block-locked' : ''} ${isError ? 'block-error' : ''}`}>

        <div
            ref={ref}
            contentEditable={block.status !== 'locked'}
            suppressContentEditableWarning={true}
            className="block-contenteditable"
            style={{
                fontFamily: fontFamily,
                color: 'inherit',
                minHeight: '1.5em',
                outline: 'none',
                whiteSpace: 'normal',
                wordBreak: 'break-word'
            }}
            onFocus={() => block.status !== 'locked' && onFocus(block.id)}
            onInput={handleInput}
            onClick={handleBlockClick}
            onKeyDown={handleKeyDown}
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