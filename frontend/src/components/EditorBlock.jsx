import React, { useEffect, useRef } from 'react';

const EditorBlock = ({ block, onFocus, isFocused, fontFamily, onChange, onEnter, onDelete }) => {
  const ref = useRef(null);
  const isResizing = useRef(false);
  const startX = useRef(0);
  const startWidth = useRef(0);
  const currentImg = useRef(null);

  const isLocked = block.status === 'locked';
  const isEditing = block.status === 'editing';
  const isError = block.status === 'error';

   useEffect(() => {
    if (ref.current && ref.current.innerHTML !== block.content) {
      ref.current.innerHTML = block.content;
    }
  }, [block.id, block.content]);

  useEffect(() => {
  if (isFocused && ref.current) {
    ref.current.focus();
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(ref.current);
    range.collapse(false);
    selection.removeAllRanges();
    selection.addRange(range);
  }
}, [isFocused]);

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
      
      range.selectNode(target);
      selection.removeAllRanges();
      selection.addRange(range);

      document
        .querySelectorAll('.editor-image.selected')
        .forEach(img => img.classList.remove('selected'));
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Backspace') {
      const selection = window.getSelection();
      const range = selection.getRangeAt(0);
      
      if (ref.current.innerHTML === '' || (range.startOffset === 0 && range.endOffset === 0)) {
        if (ref.current.innerHTML === '' || ref.current.innerText.length === 0) {
          e.preventDefault();
          onDelete(); 
          return;
        }
      }
    }

    // Xóa ảnh
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

  // Xử lý khi nhả chuột (để bắt sự kiện Resize ảnh)
  const handleMouseUp = () => {
    if (ref.current) {
      onChange(block.id, ref.current.innerHTML);
    }
  };

  // Xử lý khi dán ảnh
  const handlePaste = (e) => {
    const items = (e.clipboardData || e.originalEvent.clipboardData).items;
    for (let item of items) {
      if (item.type.indexOf("image") !== -1) {
        e.preventDefault();
        const blob = item.getAsFile();
        const reader = new FileReader();
        reader.onload = (event) => {
          const imgHtml = `<img src="${event.target.result}" style="width: 300px;" />`;
          document.execCommand('insertHTML', false, imgHtml);
          onChange(block.id, ref.current.innerHTML);
        };
        reader.readAsDataURL(blob);
      }
    }
  };
  
  // --- Logic Resize chuyên sâu ---
    const handleMouseDown = (e) => {
      if (e.target.tagName === 'IMG') {
        e.preventDefault(); 
        isResizing.current = true;
        currentImg.current = e.target;
        startX.current = e.clientX;
        startWidth.current = e.target.clientWidth;
            
        currentImg.current.classList.add('resizing-active');
            
        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleStopResize);
      }
    };

    const handleMouseMove = (e) => {
      if (!isResizing.current || !currentImg.current) return;
      const deltaX = e.clientX - startX.current;
      const newWidth = startWidth.current + deltaX;
        
      if (newWidth > 50) {
        currentImg.current.style.width = `${newWidth}px`;
        currentImg.current.style.height = 'auto'; 
      }
    };

    const handleStopResize = () => {
      if (isResizing.current) {
        isResizing.current = false;
        if (currentImg.current) {
          currentImg.current.classList.remove('resizing-active');
          onChange(block.id, ref.current.innerHTML);
        }
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleStopResize);
      }
    }; 

  return (
    <div className="block-wrapper">
      <div className={`block-content ${isEditing ? 'block-editing' : ''} ${isLocked ? 'block-locked' : ''} ${isError ? 'block-error' : ''}`}>
        <div
            ref={ref}
            data-id={block.id}
            contentEditable={!isLocked}
            suppressContentEditableWarning={true}
            className="block-contenteditable"
            style={{
              fontFamily: fontFamily,
              textAlign: block.textAlign || 'left',
              color: 'inherit',
              minHeight: '1.5em',
              outline: 'none',
              whiteSpace: 'normal',
              wordBreak: 'break-word'
            }}
            onFocus={() => !isLocked && onFocus(block.id)}
            onInput={handleInput}
            onClick={handleBlockClick}
            onKeyDown={handleKeyDown}
            onMouseUp={handleMouseUp}
            onPaste={handlePaste}
            onMouseDown={handleMouseDown}
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