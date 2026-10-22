import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FIXTURES_DIR = path.resolve(__dirname, '../tests/fixtures');

if (!fs.existsSync(FIXTURES_DIR)) {
  fs.mkdirSync(FIXTURES_DIR, { recursive: true });
}

console.log('Generating test fixtures in', FIXTURES_DIR);

// 1. Multi-page Text PDF
async function makeMultipagePdf() {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const pagesData = [
    {
      title: 'Chapter 1: Foundations of Molecular Biology',
      paragraphs: [
        'Cells are the fundamental structural and functional units of all known living organisms.',
        'The cell theory, developed in the mid-nineteenth century, establishes that all living matter is composed of one or more cells, and all cells arise from pre-existing cells through division.',
        'Eukaryotic cells contain membrane-bound organelles such as mitochondria, the endoplasmic reticulum, and the nucleus, which compartmentalize biochemical pathways and cellular respiration.',
      ],
    },
    {
      title: 'Chapter 2: Bioenergetics and ATP Synthesis',
      paragraphs: [
        'Cellular respiration converts biochemical energy from nutrients into adenosine triphosphate.',
        'Glycolysis occurs in the cytosol without requiring molecular oxygen, yielding two pyruvate molecules, two net ATP molecules, and two NADH reducing equivalents.',
        'The citric acid cycle and oxidative phosphorylation take place within the inner mitochondrial membrane, driving the chemiosmotic generation of proton gradients.',
      ],
    },
    {
      title: 'Chapter 3: Genetics, Transcription and Translation',
      paragraphs: [
        'Deoxyribonucleic acid stores biological genetic instructions organized as codons.',
        'During transcription, RNA polymerase synthesizes messenger RNA from the template DNA strand.',
        'Ribosomes translate the nucleotide triplets into specific amino acid polypeptide sequences, forming structural and catalytic proteins essential for organismal homeostasis.',
      ],
    },
  ];

  for (const p of pagesData) {
    const page = pdfDoc.addPage([600, 800]);
    page.drawText(p.title, {
      x: 50,
      y: 730,
      size: 18,
      font: boldFont,
      color: rgb(0.1, 0.2, 0.4),
    });

    let currentY = 680;
    for (const paragraph of p.paragraphs) {
      page.drawText(paragraph, {
        x: 50,
        y: currentY,
        size: 11,
        font,
        color: rgb(0.15, 0.15, 0.15),
        maxWidth: 500,
        lineHeight: 16,
      });
      currentY -= 65;
    }
  }

  const pdfBytes = await pdfDoc.save();
  const dest = path.join(FIXTURES_DIR, 'multipage-sample.pdf');
  fs.writeFileSync(dest, pdfBytes);
  console.log('✓ Created multipage-sample.pdf (3 pages, text layer)');
}

// 2. Scanned / Image-Only PDF (No text layer)
async function makeScannedPdf() {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([600, 800]);

  // Draw simulated scanned page using geometric shapes and rectangles with no text operators
  page.drawRectangle({
    x: 40,
    y: 40,
    width: 520,
    height: 720,
    borderColor: rgb(0.7, 0.7, 0.7),
    borderWidth: 1,
    color: rgb(0.96, 0.96, 0.94),
  });

  // Simulated scanned photo box
  page.drawRectangle({
    x: 100,
    y: 450,
    width: 400,
    height: 200,
    color: rgb(0.85, 0.85, 0.85),
    borderColor: rgb(0.6, 0.6, 0.6),
    borderWidth: 2,
  });

  // Simulated handwriting/stroke lines
  for (let y = 380; y >= 100; y -= 35) {
    page.drawLine({
      start: { x: 80, y },
      end: { x: 520, y },
      thickness: 1.5,
      color: rgb(0.75, 0.75, 0.8),
    });
  }

  const pdfBytes = await pdfDoc.save();
  const dest = path.join(FIXTURES_DIR, 'scanned-sample.pdf');
  fs.writeFileSync(dest, pdfBytes);
  console.log('✓ Created scanned-sample.pdf (image/graphics only, 0 text items)');
}

// 3. Encrypted / Password-protected PDF
async function makeEncryptedPdf() {
  // A standard minimal PDF structure with an /Encrypt dictionary to trigger password prompt
  const encryptedPdfString = `%PDF-1.4
1 0 obj
<<
  /Type /Catalog
  /Pages 2 0 R
>>
endobj
2 0 obj
<<
  /Type /Pages
  /Kids [3 0 R]
  /Count 1
>>
endobj
3 0 obj
<<
  /Type /Page
  /Parent 2 0 R
  /MediaBox [0 0 612 792]
  /Contents 4 0 R
>>
endobj
4 0 obj
<<
  /Length 0
>>
stream
endstream
endobj
5 0 obj
<<
  /Filter /Standard
  /V 2
  /R 3
  /O <0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef>
  /U <0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef>
  /P -3904
>>
endobj
xref
0 6
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000206 00000 n 
0000000256 00000 n 
trailer
<<
  /Size 6
  /Root 1 0 R
  /Encrypt 5 0 R
  /ID [<12345678901234567890123456789012><12345678901234567890123456789012>]
>>
startxref
412
%%EOF
`;
  const dest = path.join(FIXTURES_DIR, 'encrypted-sample.pdf');
  fs.writeFileSync(dest, Buffer.from(encryptedPdfString, 'utf-8'));
  console.log('✓ Created encrypted-sample.pdf (standard /Encrypt dictionary)');
}

// 4. Plain Text Note
function makeTxtSample() {
  const text = `Title: Operating Systems and Concurrency

Chapter 1: Process Management
A process is an instance of a computer program that is being executed by one or many threads. It contains the program code and its current activity. Each process is allocated a unique Process Identifier (PID), virtual address space, memory pages, open file descriptors, and CPU register state.

Chapter 2: Threads and Concurrency
Threads are lightweight units of execution within a process that share the same address space. Multithreading enables concurrent execution of multiple tasks within a single program. However, concurrent access to shared resources introduces race conditions, deadlocks, and priority inversion problems.

Chapter 3: Synchronization Primitives
Mutual exclusion primitives such as mutexes, semaphores, and condition variables are used to synchronize access to critical sections. A deadlock occurs when two or more processes are unable to proceed because each is waiting for the other to release a locked resource. Four Coffman conditions are required for deadlock: mutual exclusion, hold and wait, no preemption, and circular wait.
`;
  const dest = path.join(FIXTURES_DIR, 'sample-note.txt');
  fs.writeFileSync(dest, text, 'utf-8');
  console.log('✓ Created sample-note.txt');
}

// 5. Markdown with Hierarchical Headings
function makeMarkdownSample() {
  const md = `# Computer Science Algorithms and Data Structures

## Tree Data Structures

Trees are hierarchical nonlinear data structures consisting of nodes connected by directed or undirected edges.

### Binary Search Trees

A Binary Search Tree (BST) is a rooted binary tree data structure with the key property: the key in each node must be greater than or equal to any key in its left sub-tree, and less than or equal to any key in its right sub-tree.

Inorder traversal of a BST yields elements in monotonically non-decreasing order. Average search complexity is O(log n), but pathological unbalanced trees degrade to linear O(n) performance.

### Balanced Self-Balancing Trees

To guarantee O(log n) worst-case time complexity, balanced trees like AVL trees and Red-Black trees automatically rebalance upon insertion and deletion operations using tree rotations.

AVL trees maintain the balance factor invariant: for every node, the height difference between left and right subtrees must be at most 1.

## Graph Algorithms

Graphs are mathematical structures used to model pairwise relations between objects. A graph is composed of vertices (nodes) and edges.

### Dijkstra's Shortest Path Algorithm

Dijkstra's algorithm solves the single-source shortest path problem for a graph with non-negative edge weights. It iteratively selects the unvisited vertex with the smallest tentative distance using a priority queue (min-heap).

Time complexity using a Fibonacci heap is O(|E| + |V| log |V|).

### Topological Sorting

Topological sort of a directed acyclic graph (DAG) is a linear ordering of vertices such that for every directed edge u -> v, u comes before v. Kahn's algorithm computes this using in-degree vertex tracking.
`;
  const dest = path.join(FIXTURES_DIR, 'sample-lecture.md');
  fs.writeFileSync(dest, md, 'utf-8');
  console.log('✓ Created sample-lecture.md');
}

// 6. Disguised File (.pdf extension but plain text content)
function makeDisguisedPdf() {
  const content = 'This is a plain ASCII text file disguised with a .pdf extension.\nIt lacks the %PDF- magic signature header.';
  const dest = path.join(FIXTURES_DIR, 'disguised.pdf');
  fs.writeFileSync(dest, content, 'utf-8');
  console.log('✓ Created disguised.pdf (plain text with .pdf extension)');
}

// 7. Oversized Synthetic File (> 25 MiB)
function makeOversizedFile() {
  const dest = path.join(FIXTURES_DIR, 'oversized-synthetic.txt');
  const targetBytes = 25 * 1024 * 1024 + 1024; // 25 MiB + 1 KiB
  const chunkSize = 64 * 1024; // 64 KiB buffer
  const chunk = Buffer.alloc(chunkSize, 'A');

  const stream = fs.createWriteStream(dest);
  let written = 0;
  while (written < targetBytes) {
    const toWrite = Math.min(chunkSize, targetBytes - written);
    stream.write(toWrite === chunkSize ? chunk : chunk.subarray(0, toWrite));
    written += toWrite;
  }
  stream.end();
  console.log(`✓ Created oversized-synthetic.txt (${written} bytes, exceeds 25 MiB limit)`);
}

// 8. Non-Latin Text File
function makeNonLatinSample() {
  const text = `# Πολυγλωσσικό Σημειωματάριο (Multilingual Notes)

## Ελληνικά: Αρχαία Φιλοσοφία και Επιστήμη
Η επιστημονική μέθοδος ξεκίνησε με τους Προσωκρατικούς φιλοσόφους στην αρχαία Ιωνία. Ο Θαλής ο Μιλήσιος, ο Αναξίμανδρος και ο Ηράκλειτος αναζήτησαν φυσικές εξηγήσεις για τα φαινόμενα του κόσμου, απορρίπτοντας τις μυθολογικές ερμηνείες.

## 日本語: 人工知能と機械学習の基礎
機械学習（Machine Learning）は、明示的にプログラムされることなく、データから学習して予測や判断を行うアルゴリズムの研究分野です。ディープラーニング（深層学習）は多層のニューラルネットワークを用いて高次元の表現を獲得します。

## हिन्दी: तंत्रिका तंत्र और सूचना सिद्धांत
कृत्रिम तंत्रिका नेटवर्क मानव मस्तिष्क की जैविक न्यूरोनल संरचना से प्रेरित हैं। सूचना सिद्धांत में, शैनन एंट्रॉपी किसी यादृच्छिक चर में निहित अनिश्चितता की औसत दर को मापता है।

## العربية: الخوارزميات وهياكل البيانات
يعود أصل مصطلح "الخوارزمية" إلى عالم الرياضيات المسلم محمد بن موسى الخوارزمي في القرن التاسع الميلادي في بيت الحكمة ببغداد. تُعد الخوارزميات حجر الأساس في علوم الحاسوب الحديثة والذكاء الاصطناعي.
`;
  const dest = path.join(FIXTURES_DIR, 'non-latin.txt');
  fs.writeFileSync(dest, text, 'utf-8');
  console.log('✓ Created non-latin.txt (Greek, Japanese, Hindi, Arabic)');
}

async function run() {
  await makeMultipagePdf();
  await makeScannedPdf();
  await makeEncryptedPdf();
  makeTxtSample();
  makeMarkdownSample();
  makeDisguisedPdf();
  makeOversizedFile();
  makeNonLatinSample();
  console.log('All fixtures created successfully.');
}

run().catch((err) => {
  console.error('Fixture generation failed:', err);
  process.exit(1);
});
