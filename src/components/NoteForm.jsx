import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  RotateCcw,
  Save,
  Feather,
  Bold,
  Italic,
  Underline,
  Highlighter,
  Eraser,
  CalendarDays,
  List,
  ListOrdered,
  ImagePlus,
  X,
} from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { categories, noteColors } from "../data/categories";

// Create a colored text tone from the highlight itself: darker for light swatches,
// lighter for dark swatches. This avoids plain black/white while retaining contrast.
function getHighlightTextColor(hexColor) {
  const hex = hexColor.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((index) => parseInt(hex.slice(index, index + 2), 16) / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  let hue = 0;
  const lightness = (max + min) / 2;
  let saturation = 0;

  if (delta !== 0) {
    saturation = delta / (1 - Math.abs(2 * lightness - 1));
    if (max === r) hue = ((g - b) / delta) % 6;
    else if (max === g) hue = (b - r) / delta + 2;
    else hue = (r - g) / delta + 4;
    hue *= 60;
    if (hue < 0) hue += 360;
  }

  // Keep the highlight's hue, but make the text a deep or pale coordinated shade.
  const targetLightness = lightness > 0.55 ? 0.22 : 0.88;
  const targetSaturation = Math.max(0.38, Math.min(0.72, saturation || 0.5));
  const chroma = (1 - Math.abs(2 * targetLightness - 1)) * targetSaturation;
  const h = hue / 60;
  const x = chroma * (1 - Math.abs((h % 2) - 1));
  let rgb;
  if (h < 1) rgb = [chroma, x, 0];
  else if (h < 2) rgb = [x, chroma, 0];
  else if (h < 3) rgb = [0, chroma, x];
  else if (h < 4) rgb = [0, x, chroma];
  else if (h < 5) rgb = [x, 0, chroma];
  else rgb = [chroma, 0, x];
  const match = targetLightness - chroma / 2;
  return `#${rgb.map((channel) => Math.round((channel + match) * 255).toString(16).padStart(2, "0")).join("")}`;
}

// Pick a coordinated dark/light tone for ordinary note text (not pure black/white).
function getReadableTextColor(hexColor) {
  return getHighlightTextColor(hexColor);
}

export default function NoteForm({ initialNote, onSave }) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const editorRef = useRef(null);
  const coverInputRef = useRef(null);
  const undoStackRef = useRef([]);

  const requestedDate = searchParams.get("date");
  const [title, setTitle] = useState(initialNote?.title || "");
  const [content, setContent] = useState(initialNote?.content || "");
  const [category, setCategory] = useState(initialNote?.category || "Kuliah");
  const [color, setColor] = useState(initialNote?.color || "apricot");
  const [coverImage, setCoverImage] = useState(initialNote?.coverImage || "");
  const [eventDate, setEventDate] = useState(
    initialNote?.eventDate ||
      initialNote?.createdAt?.slice(0, 10) ||
      requestedDate ||
      new Date().toISOString().slice(0, 10),
  );
  const [highlightColor, setHighlightColor] = useState("#F0A599");
  const [error, setError] = useState("");

  useEffect(() => {
    if (editorRef.current) {
      editorRef.current.innerHTML = initialNote?.content || "";
      setContent(initialNote?.content || "");
    }
  }, [initialNote]);

  function handleCoverImageChange(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setError("Pilih file gambar yang valid.");
      event.target.value = "";
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setError("Ukuran gambar maksimal 2 MB.");
      event.target.value = "";
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setCoverImage(String(reader.result || ""));
      setError("");
      event.target.value = "";
    };
    reader.onerror = () => {
      setError("Gambar gagal dibaca. Coba lagi.");
      event.target.value = "";
    };
    reader.readAsDataURL(file);
  }

  function rememberEditorState() {
    const current = editorRef.current?.innerHTML ?? "";
    const stack = undoStackRef.current;
    if (stack[stack.length - 1] !== current) stack.push(current);
    if (stack.length > 100) stack.shift();
  }

  function undoEdit() {
    const previous = undoStackRef.current.pop();
    if (previous === undefined || !editorRef.current) return;
    editorRef.current.innerHTML = previous;
    setContent(previous);
    editorRef.current.focus();
  }

  function applyFormat(command, value = null) {
    rememberEditorState();
    editorRef.current?.focus();
    document.execCommand(command, false, value);
    if (editorRef.current) setContent(editorRef.current.innerHTML);
  }

  function applyHighlight(value) {
    rememberEditorState();
    setHighlightColor(value);
    editorRef.current?.focus();
    document.execCommand("hiliteColor", false, value);
    // Text follows the highlight hue: dark on light highlights, light on dark highlights.
    document.execCommand("foreColor", false, getHighlightTextColor(value));
    if (editorRef.current) setContent(editorRef.current.innerHTML);
  }

  function removeHighlight() {
    rememberEditorState();
    editorRef.current?.focus();
    // Clear only the highlight and restore the text color to match the note background.
    document.execCommand("hiliteColor", false, "transparent");
    const noteBackground = noteColors.find((item) => item.name === color)?.value || "#F09367";
    document.execCommand("foreColor", false, getReadableTextColor(noteBackground));
    setHighlightColor(null);
    if (editorRef.current) setContent(editorRef.current.innerHTML);
  }

  function handleEditorInput() {
    setContent(editorRef.current?.innerHTML || "");
  }

  function handleEditorKeyDown(event) {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
      event.preventDefault();
      undoEdit();
      return;
    }
    if (event.key !== "Enter") return;
    rememberEditorState();

    const selection = window.getSelection();
    let node = selection?.anchorNode;
    if (node?.nodeType === Node.TEXT_NODE) node = node.parentElement;

    // Di dalam daftar, Enter membuat bullet/nomor berikutnya secara otomatis.
    if (node?.closest?.("li")) return;

    // Di luar daftar, Enter membuat paragraf/baris baru yang terbaca juga saat melihat catatan.
    event.preventDefault();
    document.execCommand("insertParagraph");
    handleEditorInput();
  }

  const plainContent = content
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .trim();

  function handleSubmit(event) {
    event.preventDefault();

    if (!title.trim() || !plainContent) {
      setError("Judul dan isi catatan tidak boleh kosong.");
      return;
    }

    onSave({
      title: title.trim(),
      content: content.trim(),
      category,
      color,
      eventDate,
      coverImage,
    });

    navigate("/notes");
  }

  return (
    <div className="form-page-inner">
      <button type="button" className="back-link" onClick={() => navigate(-1)}>
        <ArrowLeft size={16} /> Back to your space
      </button>

      <form className="note-form" onSubmit={handleSubmit}>
        <div className="form-heading">
          <span className="eyebrow">
            <Feather size={13} /> YOUR THOUGHTS, YOUR SPACE
          </span>
          <h2>
            {initialNote ? "Refine this thought." : "A new thought begins."}
          </h2>
          <p>Give your idea a name, a home, and a little room to grow.</p>
        </div>

        <label htmlFor="note-title">TITLE</label>
        <input
          id="note-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="A thought worth keeping..."
          maxLength={80}
        />

        <div className="form-row">
          <div className="form-field">
            <label htmlFor="note-category">COLLECTION</label>
            <select
              id="note-category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              {categories
                .filter((item) => item !== "Semua")
                .map((item) => (
                  <option key={item}>{item}</option>
                ))}
            </select>
          </div>

          <div className="form-field">
            <label htmlFor="note-date">DATE / MEMORY DAY</label>
            <div className="date-input-wrap">
              <CalendarDays size={15} />
              <input
                id="note-date"
                type="date"
                value={eventDate}
                onChange={(e) => setEventDate(e.target.value)}
              />
            </div>
          </div>
        </div>

        <div className="form-field note-cover-field">
          <label>NOTE IMAGE</label>
          <input
            ref={coverInputRef}
            type="file"
            accept="image/*"
            onChange={handleCoverImageChange}
            hidden
          />
          <div className="note-cover-controls">
            <button
              type="button"
              className="note-cover-upload"
              onClick={() => coverInputRef.current?.click()}
            >
              <ImagePlus size={16} />
              {coverImage ? "Ganti gambar" : "Pilih gambar"}
            </button>
            {coverImage && (
              <button
                type="button"
                className="note-cover-remove"
                onClick={() => setCoverImage("")}
              >
                <X size={14} /> Hapus gambar
              </button>
            )}
          </div>
          {coverImage && (
            <img
              className="note-cover-preview"
              src={coverImage}
              alt="Preview gambar catatan"
            />
          )}
          <span className="selected-color-name">
            Gambar ini akan tampil di kartu catatan. Maksimal 2 MB.
          </span>
        </div>

        <div className="form-field note-color-field">
          <label>NOTE COLOR</label>
          <div className="color-options">
            {noteColors.map((item) => (
              <button
                type="button"
                key={item.name}
                aria-label={item.label}
                title={item.label}
                className={`color-choice ${color === item.name ? "selected" : ""}`}
                style={{ background: item.value }}
                onClick={() => setColor(item.name)}
              />
            ))}
          </div>
          <span className="selected-color-name">
            {noteColors.find((item) => item.name === color)?.label}
          </span>
        </div>

        <label htmlFor="note-content-editor">YOUR NOTE</label>

        <div
          className="editor-toolbar"
          role="toolbar"
          aria-label="Format catatan"
        >
          <button type="button" title="Undo" aria-label="Undo" onMouseDown={(e) => e.preventDefault()} onClick={undoEdit}>
            <RotateCcw size={15} />
          </button>
          <span className="toolbar-divider" />
          <label className="font-control-label" htmlFor="note-font-family">Font</label>
          <select id="note-font-family" className="editor-select" defaultValue="Arial" onMouseDown={rememberEditorState} onChange={(e) => applyFormat("fontName", e.target.value)}>
            <option value="Arial">Arial</option><option value="Georgia">Georgia</option><option value="Verdana">Verdana</option><option value="Tahoma">Tahoma</option><option value="Courier New">Courier New</option><option value="Times New Roman">Times New Roman</option>
          </select>
          <label className="font-control-label" htmlFor="note-font-size">Size</label>
          <select id="note-font-size" className="editor-select size-select" defaultValue="3" onMouseDown={rememberEditorState} onChange={(e) => applyFormat("fontSize", e.target.value)}>
            <option value="3">12</option><option value="4">16</option><option value="5">18</option><option value="6">24</option><option value="7">32</option>
          </select>
          <button
            type="button"
            title="Bold"
            aria-label="Bold"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => applyFormat("bold")}
          >
            <Bold size={16} />
          </button>
          <button
            type="button"
            title="Italic"
            aria-label="Italic"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => applyFormat("italic")}
          >
            <Italic size={16} />
          </button>
          <button
            type="button"
            title="Underline"
            aria-label="Underline"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => applyFormat("underline")}
          >
            <Underline size={16} />
          </button>
          <span className="toolbar-divider" />
          <button
            type="button"
            title="Bulleted list"
            aria-label="Bulleted list"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => applyFormat("insertUnorderedList")}
          >
            <List size={16} />
          </button>
          <button
            type="button"
            title="Numbered list"
            aria-label="Numbered list"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => applyFormat("insertOrderedList")}
          >
            <ListOrdered size={16} />
          </button>
          <span className="toolbar-divider" />
          <span className="highlight-label">
            <Highlighter size={14} /> Highlight:
          </span>
          <div className="highlight-palette">
            <button
              type="button"
              className="highlight-remove"
              title="Hapus highlight dari teks yang dipilih"
              aria-label="Hapus highlight"
              onMouseDown={(e) => e.preventDefault()}
              onClick={removeHighlight}
            >
              <Eraser size={14} />
            </button>
            {noteColors.map((item) => (
              <button
                type="button"
                key={item.name}
                className={`highlight-swatch ${highlightColor === item.value ? "selected" : ""}`}
                style={{ background: item.value }}
                title={`Stabilo ${item.label}`}
                aria-label={`Stabilo ${item.label}`}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => applyHighlight(item.value)}
              />
            ))}
          </div>
          <span className="toolbar-hint">
            Pilih teks, lalu pilih format atau warna stabilo.
          </span>
        </div>

        <div
          id="note-content-editor"
          ref={editorRef}
          className="note-rich-editor"
          contentEditable
          suppressContentEditableWarning
          role="textbox"
          aria-label="Isi catatan"
          aria-multiline="true"
          data-placeholder="Let it out. You can organize it later..."
          onBeforeInput={rememberEditorState}
          onInput={handleEditorInput}
          onKeyDown={handleEditorKeyDown}
          style={{
            backgroundColor: noteColors.find((item) => item.name === color)?.value || "#F09367",
            color: getReadableTextColor(noteColors.find((item) => item.name === color)?.value || "#F09367"),
          }}
        />

        {error && <p className="form-error">{error}</p>}

        <div className="form-footer">
          <span>{plainContent.length} characters</span>
          <button className="primary-button" type="submit">
            <Save size={16} /> Save this note
          </button>
        </div>
      </form>
    </div>
  );
}
