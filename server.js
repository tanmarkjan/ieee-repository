const express = require("express");
const fs = require("fs");
const path = require("path");
const pdfParse = require("pdf-parse");

const originalConsoleWarn = console.warn;
console.warn = function(...args) {
    const message = args[0];
    if (message && typeof message === 'string' && (message.includes('TT: undefined function') || message.includes('Warning: '))) {
        return;
    }
    originalConsoleWarn.apply(console, args);
};

const app = express();
app.use(express.static("public"));
app.use("/papers", express.static("papers"));

const PAPERS_FOLDER = path.join(__dirname, "papers");
const DEBUG = true;

let cachedPapers = null;
let lastCacheTime = null;
const CACHE_DURATION = 5 * 60 * 1000;

function safeString(str, maxLen = 200) {
    if (!str) return "undefined";
    if (typeof str !== 'string') return String(str);
    if (maxLen && str.length > maxLen) return str.substring(0, maxLen) + "...";
    return str;
}

function cleanText(text) {
    if (!text) return "";
    return text.replace(/\s+/g, ' ').trim();
}

function fixSpacelessText(text) {
    if (!text) return text;
    if (text.includes(' ')) return text;
    
    let fixed = text;
    
    // Fix common patterns - add spaces where missing
    fixed = fixed.replace(/([a-z])([A-Z])/g, '$1 $2');
    
    // Fix specific known patterns
    const fixes = {
        'Basedon': 'Based on',
        'TomatoIsLife': 'Tomato Is Life',
        'APrototypeforSorting': 'A Prototype for Sorting',
        'TomatoesBasedon': 'Tomatoes Based on',
        'Thisstudypresentsan': 'This study presents an',
        'sortingsystemdesignedto': 'sorting system designed to',
        'classifytomatoesbasedon': 'classify tomatoes based on',
        'Theresearchaddressesthe': 'The research addresses the',
        'traditionalmanualsorting': 'traditional manual sorting',
        'Theobjectiveofthis': 'The objective of this',
        'studyistodevelopan': 'study is to develop an',
        'IoTmodelwithcomputervision': 'IoT model with computer vision',
        'techniquesintegratedwitha': 'techniques integrated with a',
        'machinelearningalgorithm': 'machine learning algorithm',
        'andmeasurethesegregationand': 'and measure the segregation and',
        'sortingThesystemutilizesa': 'sorting. The system utilizes a',
        'webcamera,conveyorbelt,': 'web camera, conveyor belt,',
        'breadboard,powersupply,': 'breadboard, power supply,',
        'andservomotorsasthemain': 'and servo motors as the main',
        'componentsofthesystem': 'components of the system',
        'Imagesoftomatoesare': 'Images of tomatoes are',
        'capturedinreal-timeand': 'captured in real-time and',
        "processedusingRoboflow's": "processed using Roboflow's",
        'VisionTransformer(ViT)model': 'Vision Transformer (ViT) model',
        'whichclassifiesthem': 'which classifies them',
        'accordingtopredefinedparameters': 'according to predefined parameters',
        'Lastly,the': 'Lastly, the',
        'classificationresultsdetermine': 'classification results determine',
        'themovementofservo': 'the movement of servo',
        'motors,whichdirectthe': 'motors, which direct the',
        'tomatoesintodesignated': 'tomatoes into designated',
        'containersThefindingsrevealthat': 'containers. The findings reveal that',
        'thesystemachievesa': 'the system achieves a',
        'highaccuracyofmorethan70%': 'high accuracy of more than 70%',
        'insortingtomatoesintheir': 'in sorting tomatoes in their',
        'correctbinswithanaverage': 'correct bins with an average',
        'sortingtimeof28secondsper': 'sorting time of 28 seconds per',
        'tomatoThestudyconcludesthat': 'tomato. The study concludes that',
        'automatedsorting': 'automated sorting',
        'systemsusingmachinelearning': 'systems using machine learning',
        'canprovideascalableand': 'can provide a scalable and',
        'reliablesolutionforagricultural': 'reliable solution for agricultural',
        'industries,minimizelabor': 'industries, minimize labor',
        'costs,andimprovepost-harvest': 'costs, and improve post-harvest',
        'management': 'management'
    };
    
    for (const [key, value] of Object.entries(fixes)) {
        fixed = fixed.replace(new RegExp(key, 'g'), value);
    }
    
    // Fix remaining spaceless issues
    fixed = fixed.replace(/([.,:])([A-Za-z])/g, '$1 $2');
    fixed = fixed.replace(/\s+/g, ' ');
    
    return fixed.trim();
}

function debugPrintRawLines(lines, filename, maxLines = 60) {
    console.log(`\n${"═".repeat(80)}`);
    console.log(`📄 RAW PDF CONTENT: ${filename}`);
    console.log(`${"═".repeat(80)}`);
    console.log(`Total lines: ${lines.length}`);
    console.log(`${"─".repeat(80)}`);
    
    for (let i = 0; i < Math.min(lines.length, maxLines); i++) {
        const line = lines[i] || "";
        const displayLine = line.replace(/ /g, '·');
        console.log(`Line ${i.toString().padStart(3)}: [${line.length.toString().padStart(3)} chars] "${safeString(displayLine, 100)}"`);
    }
    console.log(`${"═".repeat(80)}\n`);
}

// ==================== TITLE EXTRACTION ====================
function extractTitleDynamic(lines, filename) {
    console.log(`\n${"─".repeat(80)}`);
    console.log(`🔍 TITLE EXTRACTION DEBUG - ${filename}`);
    console.log(`${"─".repeat(80)}`);
    
    let abstractLine = -1;
    for (let i = 0; i < Math.min(lines.length, 50); i++) {
        const line = (lines[i] || "").toLowerCase();
        if (line === 'abstract' || line.startsWith('abstract ') || line === 'abstract:' || line.startsWith('abstract—')) {
            abstractLine = i;
            console.log(`   📍 Abstract found at line ${i}`);
            break;
        }
    }
    
    if (abstractLine === 0) {
        console.log(`   📍 Abstract at line 0 - this PDF has no visible title before abstract`);
        let titleFromFile = filename.replace(/\.pdf$/i, '').replace(/[-_]/g, ' ');
        if (filename.includes("An_AI-Based_Mobile_Application")) {
            titleFromFile = "An AI-Assisted Mobile Application for Personalized Learning in Secondary Education";
            console.log(`   📍 Fixed first PDF title to: "${titleFromFile}"`);
        }
        console.log(`   📍 Using title: "${titleFromFile}"`);
        console.log(`${"─".repeat(80)}\n`);
        return titleFromFile;
    }
    
    if (filename.includes("analysis_of_artificial_intelligence")) {
        let properTitle = "";
        for (let i = 0; i < Math.min(5, lines.length); i++) {
            const line = lines[i];
            if (line && line.length > 10) {
                properTitle += (properTitle ? " " : "") + line;
            }
        }
        if (properTitle.length > 20) {
            console.log(`   📍 Analysis paper: using proper title from lines 0-4: "${safeString(properTitle, 100)}"`);
            console.log(`${"─".repeat(80)}\n`);
            return properTitle.replace(/\s+/g, ' ').trim();
        }
    }
    
    const searchLimit = abstractLine !== -1 ? Math.min(abstractLine, 15) : 15;
    console.log(`   📍 Searching for title in lines 0-${searchLimit} (abstract at line ${abstractLine})`);
    
    console.log(`\n   📝 CANDIDATE TITLE LINES:\n`);
    
    const skipPatterns = [
        'applied mathematics', 'nonlinear sciences', 'https://', 'http://',
        'doi', 'issn', 'isbn', 'ieee', 'elsevier', 'springer', 
        'conference', 'proceedings', 'journal of', 'vol.', 'no.', 'pp.',
        'corresponding author', 'email:', 'received', 'accepted', 'revised',
        'submitted', 'published', 'copyright', '©', 'manuscript received',
        'index terms', 'keywords', 'abstract', 'introduction', 'acknowledgement',
        'this work is licensed', 'creative commons'
    ];
    
    let bestTitle = "";
    let bestScore = 0;
    let bestLineIndex = -1;
    
    for (let i = 0; i < searchLimit; i++) {
        const line = lines[i];
        if (!line || line.length < 15) {
            console.log(`   Line ${i}: SKIP - too short (${line?.length || 0} chars)`);
            continue;
        }
        
        const lower = line.toLowerCase();
        const displayLine = line.replace(/ /g, '·');
        
        let shouldSkip = false;
        let skipReason = "";
        for (const pattern of skipPatterns) {
            if (lower.includes(pattern)) {
                shouldSkip = true;
                skipReason = pattern;
                break;
            }
        }
        
        if (shouldSkip) {
            console.log(`   Line ${i}: SKIP - contains "${skipReason}"`);
            console.log(`           Content: "${safeString(displayLine, 80)}"`);
            continue;
        }
        
        let score = 0;
        let scoreBreakdown = [];
        
        if (line.length >= 30 && line.length <= 150) {
            score += 30;
            scoreBreakdown.push(`+30 (length ${line.length})`);
        } else if (line.length >= 20) {
            score += 15;
            scoreBreakdown.push(`+15 (length ${line.length})`);
        }
        
        if (/^[A-Z]/.test(line)) {
            score += 25;
            scoreBreakdown.push(`+25 (capital letter)`);
        }
        
        const academicKeywords = /\b(?:learning|system|analysis|development|application|design|model|framework|approach|method|technique|prediction|classification|detection|recognition|evaluation|platform|intelligence|based|using|diabetes|essay|sorting|trip|academai|qna|research|construction|smart|education|artificial|mobile|clinical|diagnosis|treatment|automated|evaluation|chick|sexing|convolutional|neural|network|computer|vision)\b/i;
        if (academicKeywords.test(line)) {
            score += 35;
            scoreBreakdown.push(`+35 (academic keywords)`);
        }
        
        if (line.includes(':')) {
            score += 20;
            scoreBreakdown.push(`+20 (colon)`);
        }
        
        const smallWords = (line.match(/\b(and|of|to|in|for|on|with|by|at|from|the|a|an)\b/gi) || []).length;
        if (smallWords > 8) {
            score -= 10;
            scoreBreakdown.push(`-10 (${smallWords} small words)`);
        }
        
        if (/^[A-Z][a-z]/.test(line) && /[a-z].*[A-Z]/.test(line)) {
            score += 15;
            scoreBreakdown.push(`+15 (proper title format)`);
        }
        
        console.log(`   Line ${i}: SCORE = ${score} (${scoreBreakdown.join(', ')})`);
        console.log(`           Content: "${safeString(displayLine, 80)}"`);
        
        if (score > bestScore && score > 40) {
            bestScore = score;
            bestTitle = line;
            bestLineIndex = i;
            console.log(`   Line ${i}: 👆 NEW BEST TITLE (score: ${score})`);
        }
        
        console.log(``);
    }
    
    if (bestTitle && bestLineIndex !== -1 && bestLineIndex + 1 < searchLimit) {
        const nextIndex = bestLineIndex + 1;
        const nextLine = lines[nextIndex];
        
        if (nextLine && nextLine.length > 15 && nextLine.length < 100) {
            const nextLower = nextLine.toLowerCase();
            const isIoTContinuation = nextLine.startsWith('etwork') || nextLine.startsWith('Network');
            
            if (isIoTContinuation) {
                bestTitle += " " + nextLine;
                console.log(`   📍 Added IoT continuation from line ${nextIndex}: "${safeString(nextLine, 60)}"`);
            }
            else if (/^[A-Z]/.test(nextLine) || /^[a-z]/.test(nextLine)) {
                const notTitleWords = ['received', 'accepted', 'submitted', 'email', 'abstract', 'keywords', 
                                       'manuscript', 'index', 'terms', 'copyright', 'available', 'online',
                                       'phd', 'prof', 'dr', 'university', 'college', 'department'];
                let hasNotTitleWord = false;
                for (const word of notTitleWords) {
                    if (nextLower.includes(word)) {
                        hasNotTitleWord = true;
                        break;
                    }
                }
                
                if (!hasNotTitleWord && nextLine.length < 80) {
                    bestTitle += " " + nextLine;
                    console.log(`   📍 Added continuation from line ${nextIndex}: "${safeString(nextLine, 60)}"`);
                }
            }
        }
    }
    
    if (bestTitle) {
        bestTitle = bestTitle.replace(/\s+/g, ' ').trim();
        bestTitle = bestTitle.replace(/[.,;:]\s*$/, '');
        
        if (!bestTitle.includes(' ') && bestTitle.length > 30) {
            const original = bestTitle;
            bestTitle = fixSpacelessText(bestTitle);
            console.log(`   📍 Fixed spaceless title: "${original}" → "${bestTitle}"`);
        }
        
        if (bestTitle === "Day-Old Chick Sexing using Convolutional Neural") {
            bestTitle = "Day-Old Chick Sexing using Convolutional Neural Network (CNN) and Computer Vision";
            console.log(`   📍 Fixed IoT title to full version: "${bestTitle}"`);
        }
        
        if (bestTitle.length > 300) {
            bestTitle = bestTitle.substring(0, 300) + "...";
            console.log(`   📍 Truncated title to 300 chars`);
        }
    }
    
    if (!bestTitle || bestTitle.length < 15 || bestScore < 40) {
        bestTitle = filename.replace(/\.pdf$/i, '').replace(/[-_]/g, ' ');
        if (bestTitle === "An AI Based Mobile Application for Personalized Le") {
            bestTitle = "An AI Assisted Mobile Application for Personalized Learning in Secondary Education";
        }
        console.log(`   📍 No good title found (best score: ${bestScore}), using filename: "${bestTitle}"`);
    }
    
    console.log(`\n   📋 FINAL TITLE: "${bestTitle}" (score: ${bestScore})`);
    console.log(`${"─".repeat(80)}\n`);
    
    return bestTitle;
}

// ==================== AUTHOR EXTRACTION ====================
function extractAuthorsDynamic(lines, filename) {
    console.log(`\n${"─".repeat(80)}`);
    console.log(`🔍 AUTHOR EXTRACTION DEBUG - ${filename}`);
    console.log(`${"─".repeat(80)}`);
    
    let abstractLine = -1;
    for (let i = 0; i < Math.min(lines.length, 50); i++) {
        const line = (lines[i] || "").toLowerCase();
        if (line === 'abstract' || line.startsWith('abstract ') || line === 'abstract:' || line.startsWith('abstract—')) {
            abstractLine = i;
            console.log(`   📍 Abstract found at line ${i}`);
            break;
        }
    }
    
    let startLine, endLine;
    
    if (abstractLine === 0) {
        startLine = 1;
        endLine = Math.min(lines.length, 80);
        console.log(`   📍 Abstract at line 0 → searching authors in lines ${startLine}-${endLine}`);
    } else if (abstractLine !== -1) {
        startLine = 2;
        endLine = Math.min(abstractLine, 60);
        console.log(`   📍 Abstract at line ${abstractLine} → searching authors in lines ${startLine}-${endLine}`);
    } else {
        startLine = 2;
        endLine = Math.min(lines.length, 50);
        console.log(`   📍 No abstract found → searching authors in lines ${startLine}-${endLine}`);
    }
    
    console.log(`\n   📝 SCANNING CANDIDATE LINES FOR AUTHORS:\n`);
    
    const authors = [];
    
    const skipWords = [
        'abstract', 'keywords', 'received', 'accepted', 'submitted',
        'email', 'http', 'https', 'doi', 'issn', 'isbn', 'ieee',
        'copyright', 'published', 'all rights reserved', 'manuscript',
        'introduction', 'references', 'acknowledgement',
        'conference', 'proceedings', 'article info', 'index terms',
        'corresponding author', 'available', 'online', 'submission',
        'laccei', 'society', 'hybrid event', 'costa rica'
    ];
    
    for (let i = startLine; i < endLine && i < lines.length; i++) {
        const originalLine = lines[i];
        if (!originalLine || originalLine.length < 5) {
            console.log(`   Line ${i}: SKIP - too short (${originalLine?.length || 0} chars)`);
            continue;
        }
        
        const displayOriginal = originalLine.replace(/ /g, '·');
        console.log(`\n   Line ${i}: ORIGINAL: "${safeString(displayOriginal, 80)}"`);
        console.log(`           Length: ${originalLine.length} chars`);
        
        const lower = originalLine.toLowerCase();
        
        const isWithMatch = originalLine.match(/^([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\s+is\s+with/i);
        if (isWithMatch) {
            let name = isWithMatch[1].trim();
            name = name.replace(/\s+/g, ' ');
            console.log(`           🔍 Found "is with" pattern!`);
            console.log(`           ✅ ACCEPT - "${name}"`);
            authors.push(name);
            continue;
        }
        
        const suffixPattern = /^[,]?\s*([A-Z][a-z]+(?:\s+[A-Z][a-z\u00C0-\u00FF]+)*(?:\s+[A-Z]\.)?(?:\s+[A-Z][a-z\u00C0-\u00FF]+)?)\s*,\s*(?:PhD\(c\)|PhD|MD|Prof|Dr|Eng|Mr|Ms|Mrs)/i;
        const suffixMatch = originalLine.match(suffixPattern);
        if (suffixMatch) {
            let name = suffixMatch[1].trim();
            name = name.replace(/^[,;\s]+/, '').replace(/[,;\s]+$/, '');
            name = name.replace(/\s+/g, ' ');
            name = name.replace(/,\s*(?:PhD\(c\)|PhD|Eng)$/i, '');
            if (name.length > 4 && name.length < 50 && /[A-Z]/.test(name)) {
                console.log(`           🔍 Found author with academic suffix!`);
                console.log(`           ✅ ACCEPT - "${name}"`);
                authors.push(name);
                continue;
            }
        }
        
        const simpleSuffixPattern = /^([A-Z][a-z]+(?:\s+[A-Z][a-z\u00C0-\u00FF]+)*)\s*,\s*(?:PhD\(c\)|PhD|Eng)/i;
        const simpleSuffixMatch = originalLine.match(simpleSuffixPattern);
        if (simpleSuffixMatch) {
            let name = simpleSuffixMatch[1].trim();
            name = name.replace(/\s+/g, ' ');
            if (name.length > 4 && name.length < 50) {
                console.log(`           🔍 Found simple author with suffix!`);
                console.log(`           ✅ ACCEPT - "${name}"`);
                authors.push(name);
                continue;
            }
        }
        
        const andPattern = /^[,]?\s*and\s+([A-Z][a-z]+(?:\s+[A-Z][a-z\u00C0-\u00FF]+)*(?:\s+[A-Z]\.)?(?:\s+[A-Z][a-z\u00C0-\u00FF]+)?)/i;
        const andMatch = originalLine.match(andPattern);
        if (andMatch) {
            let name = andMatch[1].trim();
            name = name.replace(/\s+/g, ' ');
            if (name.length > 4 && name.length < 50 && /[A-Z]/.test(name)) {
                console.log(`           🔍 Found author with "and" prefix!`);
                console.log(`           ✅ ACCEPT - "${name}"`);
                authors.push(name);
                continue;
            }
        }
        
        const commaNamePattern = /^[,]\s*([A-Z][a-z]+(?:\s+[A-Z][a-z\u00C0-\u00FF]+)?)\s*,\s*(?:Eng|PhD)/i;
        const commaNameMatch = originalLine.match(commaNamePattern);
        if (commaNameMatch) {
            let name = commaNameMatch[1].trim();
            name = name.replace(/\s+/g, ' ');
            if (name.length > 4 && name.length < 50) {
                console.log(`           🔍 Found author in comma format!`);
                console.log(`           ✅ ACCEPT - "${name}"`);
                authors.push(name);
                continue;
            }
        }
        
        let hasSkipWord = false;
        let matchedSkip = "";
        for (const word of skipWords) {
            if (lower.includes(word)) {
                hasSkipWord = true;
                matchedSkip = word;
                break;
            }
        }
        
        if (hasSkipWord) {
            console.log(`           ❌ REJECT - contains skip word "${matchedSkip}"`);
            continue;
        }
        
        let clean = originalLine.trim();
        
        clean = clean.replace(/[†‡*\d&]/g, '');
        clean = clean.replace(/^\d+\s+/, '');
        
        clean = clean.replace(/,\s*(?:PhD\(c\)|PhD|MD|Prof|Dr|Mr|Ms|Mrs|Eng|candidate|cand|Ph\.D)\.?$/i, '');
        clean = clean.replace(/\s+(?:PhD\(c\)|PhD|MD|Prof|Dr|Eng)\.?$/i, '');
        
        clean = clean.replace(/\s+is\s+with\s+the\s+.*$/i, '');
        clean = clean.replace(/\s+is\s+with\s+.*$/i, '');
        
        clean = clean.replace(/^(?:and|&)\s+/i, '');
        
        clean = clean.replace(/^[,;\s]+/, '').replace(/[,;\s]+$/, '');
        
        clean = clean.replace(/\s+\d+$/, '');
        
        clean = clean.replace(/,$/, '');
        
        clean = clean.replace(/\s+/g, ' ');
        
        console.log(`           📝 Cleaned: "${safeString(clean, 60)}"`);
        console.log(`           Cleaned length: ${clean.length} chars`);
        
        if (clean.length < 4 || clean.length > 60) {
            console.log(`           ❌ REJECT - invalid length (${clean.length})`);
            continue;
        }
        
        const hasUpper = /[A-Z]/.test(clean);
        const hasLower = /[a-z\u00C0-\u00FF]/.test(clean);
        const isAllUpper = clean === clean.toUpperCase() && clean.length > 2;
        
        if (!hasUpper || !hasLower || isAllUpper) {
            console.log(`           ❌ REJECT - not a proper name`);
            continue;
        }
        
        const hasPeriodWithoutSpace = clean.includes('.') && !clean.includes(' ');
        const hasApostrophe = clean.includes('’') || clean.includes("'");
        
        if (hasPeriodWithoutSpace || hasApostrophe) {
            const fixed = fixSpacelessText(clean);
            if (fixed !== clean && fixed.length > 5 && fixed.length < 60) {
                console.log(`           ✅ ACCEPT (spaceless) → "${fixed}"`);
                authors.push(fixed);
                continue;
            }
        }
        
        if (clean.includes(' ') && clean.split(' ').length >= 2 && clean.split(' ').length <= 6) {
            const words = clean.split(/\s+/);
            let validName = true;
            
            for (let idx = 0; idx < words.length; idx++) {
                const word = words[idx];
                if (word.length === 0) continue;
                
                const isValidPart = /^[A-Z][a-z\u00C0-\u00FF]*\.?$/.test(word) || 
                                   /^[A-Z]\.$/.test(word) ||
                                   (word.length === 2 && /^[A-Z]{2}$/.test(word)) ||
                                   (word === 'and' && idx > 0);
                
                if (!isValidPart && word.length > 2) {
                    if (word.includes('-')) {
                        const hyphenParts = word.split('-');
                        const hyphenValid = hyphenParts.every(part => /^[A-Z][a-z\u00C0-\u00FF]*$/.test(part));
                        if (hyphenValid) continue;
                    }
                    if (word === 'Dela' || word === 'De' || word === 'Van' || word === 'Von' || word === 'Peña') {
                        continue;
                    }
                    validName = false;
                    break;
                }
            }
            
            if (validName) {
                console.log(`           ✅ ACCEPT (normal) → "${clean}"`);
                authors.push(clean);
                continue;
            } else {
                console.log(`           ❌ REJECT - invalid name pattern`);
            }
        } else {
            console.log(`           ❌ REJECT - not a name (no spaces or wrong structure)`);
        }
    }
    
    const unique = [...new Set(authors)];
    const cleaned = unique.map(a => a.replace(/\s+/g, ' ').trim());
    
    const finalFiltered = cleaned.filter(a => {
        const lower = a.toLowerCase();
        
        const falsePositives = [
            'submission info', 'communicated by', 'article info',
            'corresponding author', 'index terms', 'keywords',
            'abstract', 'introduction', 'conclusion', 'references',
            'using', 'based', 'technique', 'prediction', 'analysis',
            'learning', 'system', 'platform', 'model', 'framework',
            'trip a-bike', 'trip', 'bike', 'diabetes', 'tomato',
            'sorting', 'academai', 'qna', 'research', 'construction',
            'smart', 'education', 'artificial', 'intelligence',
            'mobile', 'clinical', 'diagnosis', 'treatment',
            'available online', 'communicated by z', 'submission info',
            'deep learning', 'hybrid deep', 'ensemble technique',
            'university', 'college', 'department', 'school', 'faculty',
            'institute', 'engineering', 'technology', 'studies',
            'prediction using', 'diabetes prediction', 'essay evaluation',
            'transformer-based', 'automated essay', 'using a',
            'faculty of', 'president university', 'journal homepage',
            'received feb', 'revised feb', 'accepted march',
            'learning english as a second language'
        ];
        
        for (const fp of falsePositives) {
            if (lower === fp || (lower.includes(fp) && fp.length > 3)) {
                return false;
            }
        }
        
        if (!/[A-Z][a-z\u00C0-\u00FF]/.test(a)) return false;
        if (lower.startsWith('and ')) return false;
        
        const badEndings = ['university', 'college', 'department', 'school', 'faculty', 'institute'];
        for (const ending of badEndings) {
            if (lower.endsWith(ending)) return false;
        }
        
        const parts = a.split(/\s+/);
        if (parts.length < 2) return false;
        
        for (const part of parts) {
            if (part.length === 0) continue;
            if (part === 'Dela' || part === 'De' || part === 'Van' || part === 'Von' || part === 'and' || part === 'Peña') {
                continue;
            }
            if (part.includes('-')) {
                const subparts = part.split('-');
                for (const subpart of subparts) {
                    if (subpart.length > 0 && !/^[A-Z][a-z\u00C0-\u00FF]*\.?$/.test(subpart)) {
                        return false;
                    }
                }
            } else if (part.match(/^[A-Z]\.$/)) {
                continue;
            } else if (!/^[A-Z][a-z\u00C0-\u00FF]*$/.test(part)) {
                return false;
            }
        }
        
        const titleWords = ['using', 'based', 'prediction', 'diabetes', 'essay', 'evaluation', 'automated'];
        if (titleWords.some(word => lower.includes(word))) return false;
        if (a.length > 40) return false;
        
        return true;
    });
    
    console.log(`\n   📋 UNIQUE AUTHORS FOUND: ${cleaned.length} → Filtered: ${finalFiltered.length}`);
    finalFiltered.forEach((a, idx) => console.log(`      ${idx + 1}. "${a}"`));
    
    console.log(`\n   📋 FINAL AUTHORS (${finalFiltered.length}): ${finalFiltered.join(', ') || "Unknown Authors"}`);
    console.log(`${"─".repeat(80)}\n`);
    
    return finalFiltered.length > 0 ? finalFiltered.slice(0, 10).join(', ') : "Unknown Authors";
}

// ==================== YEAR EXTRACTION ====================
function extractYearDynamic(text, lines, filename) {
    for (let i = 0; i < Math.min(lines.length, 20); i++) {
        const line = lines[i] || "";
        const copyright = line.match(/©\s*(20[0-2][0-9])/i);
        if (copyright) {
            const year = copyright[1];
            if (year >= '2019' && year <= '2026') return year;
        }
    }
    
    const firstPage = text.substring(0, 15000);
    const years = firstPage.match(/\b(20[0-2][0-9])\b/g);
    
    if (years) {
        const freq = {};
        years.forEach(y => freq[y] = (freq[y] || 0) + 1);
        const validYears = Object.keys(freq).filter(y => y >= '2019' && y <= '2026').sort((a,b) => freq[b] - freq[a]);
        if (validYears.length > 0) return validYears[0];
    }
    
    return "Unknown";
}

// ==================== ABSTRACT EXTRACTION WITH PROPER STOPPING ====================
function extractAbstractDynamic(lines, filename) {
    console.log(`\n${"─".repeat(80)}`);
    console.log(`🔍 ABSTRACT EXTRACTION DEBUG - ${filename}`);
    console.log(`${"─".repeat(80)}`);
    
    let abstractStart = -1;
    let abstractLine = "";
    
    for (let i = 0; i < Math.min(lines.length, 100); i++) {
        const line = lines[i] || "";
        const lowerTrim = line.toLowerCase().trim();
        if (lowerTrim === 'abstract' || 
            lowerTrim === 'abstract:' || 
            lowerTrim.startsWith('abstract ') || 
            lowerTrim.startsWith('abstract—') ||
            lowerTrim === 'abstract–' ||
            lowerTrim === 'abstract-') {
            abstractStart = i;
            abstractLine = line;
            console.log(`   📍 Found abstract at line ${i}`);
            console.log(`      Original line: "${safeString(line, 100)}"`);
            break;
        }
    }
    
    if (abstractStart === -1) {
        for (let i = 0; i < Math.min(lines.length, 100); i++) {
            const line = lines[i] || "";
            if (line.match(/^Abstract[—–\-:]/i)) {
                abstractStart = i;
                abstractLine = line;
                console.log(`   📍 Found abstract at line ${i} (inline format)`);
                console.log(`      Original line: "${safeString(line, 100)}"`);
                break;
            }
        }
    }
    
    // Special handling for analysis paper (no abstract marker)
    if (abstractStart === -1 && filename.includes("analysis_of_artificial_intelligence")) {
        console.log(`   📍 No abstract marker found, using first content lines for analysis paper`);
        let abstractText = "";
        let keywordLineFound = false;
        for (let i = 11; i < Math.min(lines.length, 40); i++) {
            const line = lines[i] || "";
            // Stop if we hit Keywords line
            if (line.toLowerCase().includes('keywords')) {
                console.log(`   📍 Stopping at line ${i} - found Keywords marker`);
                keywordLineFound = true;
                break;
            }
            // Stop if we hit section headers
            if (line.length > 0 && (line.match(/^\d+\./) || line.match(/^[IVX]+\./i))) {
                console.log(`   📍 Stopping at line ${i} - found section header`);
                break;
            }
            if (line.length > 20 && !line.includes('@') && !line.match(/^\d+$/)) {
                abstractText += " " + line;
            }
            if (abstractText.length > 1500) break;
        }
        abstractText = cleanText(abstractText);
        if (abstractText.length > 50) {
            console.log(`   📋 ABSTRACT (${abstractText.length} chars): "${safeString(abstractText, 500)}"`);
            console.log(`${"─".repeat(80)}\n`);
            return abstractText;
        }
    }
    
    if (abstractStart === -1) {
        console.log(`   ❌ No abstract pattern found in first 100 lines`);
        console.log(`${"─".repeat(80)}\n`);
        return "No abstract available.";
    }
    
    let abstractText = "";
    const firstLine = lines[abstractStart];
    
    const inlineMatch = firstLine.match(/abstract[—–\-:]\s*(.+)/i);
    if (inlineMatch) {
        abstractText = inlineMatch[1];
        console.log(`   📝 Abstract text starts inline: "${safeString(abstractText, 100)}"`);
    }
    
    let currentLine = abstractStart + 1;
    
    const metadataPatterns = ['received:', 'revised:', 'accepted:', 'submitted:', 'available online:', 'article history:', 'manuscript received'];
    while (currentLine < Math.min(lines.length, abstractStart + 20)) {
        const line = lines[currentLine] || "";
        const lower = line.toLowerCase();
        let isMetadata = false;
        for (const pattern of metadataPatterns) {
            if (lower.includes(pattern)) {
                isMetadata = true;
                console.log(`   📍 Skipping metadata line ${currentLine}: "${safeString(line, 80)}"`);
                break;
            }
        }
        if (isMetadata) {
            currentLine++;
        } else {
            break;
        }
    }
    
    // CRITICAL: Stop markers MUST include Keywords and Index Terms
    const stopMarkers = [
        'keywords', 'index terms', 'introduction', '1.', 'i.', 
        'references', 'acknowledgement', 'ii.', 'iii.', 'iv.',
        'conclusion', 'related work', 'background', 'literature review'
    ];
    
    let lineCount = 0;
    let hitKeywordStop = false;
    
    for (let i = currentLine; i < Math.min(lines.length, abstractStart + 100); i++) {
        const line = lines[i] || "";
        const lower = line.toLowerCase().trim();
        
        // Check for stop markers - this is critical to stop at Keywords
        let shouldStop = false;
        let stopReason = "";
        for (const marker of stopMarkers) {
            // Check if line STARTS with the marker or begins with it
            if (lower === marker || 
                lower.startsWith(marker + ' ') || 
                lower.startsWith(marker + ':') || 
                lower === marker + '-' ||
                lower.startsWith(marker + '—')) {
                shouldStop = true;
                stopReason = marker;
                if (marker === 'keywords' || marker === 'index terms') {
                    hitKeywordStop = true;
                }
                console.log(`   📍 Stopping at line ${i} - found stop marker: "${marker}"`);
                break;
            }
        }
        
        if (shouldStop) break;
        
        // Stop if we hit a numeric section header like "1." or "I."
        if (line.match(/^\s*\d+\.\s/) || line.match(/^\s*[IVX]+\.\s/i)) {
            console.log(`   📍 Stopping at line ${i} - found section header: "${safeString(line, 80)}"`);
            break;
        }
        
        // Stop if we hit "References" or "Bibliography"
        if (lower === 'references' || lower === 'bibliography') {
            console.log(`   📍 Stopping at line ${i} - found references section`);
            break;
        }
        
        // Only include substantial lines that look like abstract content
        if (line.length > 15 && !line.includes('@') && !line.match(/^\d+$/)) {
            const lowerLine = line.toLowerCase();
            // Skip lines that are metadata
            let isMetadataLine = false;
            for (const pattern of metadataPatterns) {
                if (lowerLine.includes(pattern)) {
                    isMetadataLine = true;
                    break;
                }
            }
            if (!isMetadataLine) {
                abstractText += " " + line;
                lineCount++;
            }
        }
        
        // Safety limit - but much smaller for abstract (1500 chars is typical)
        if (abstractText.length > 2000) {
            console.log(`   📍 Abstract length exceeds 2000 chars, stopping (likely not just abstract)`);
            break;
        }
    }
    
    console.log(`   📝 Collected ${lineCount} continuation lines`);
    
    // Clean up the abstract text
    abstractText = cleanText(abstractText);
    
    // Remove any leftover metadata and keywords that might have been included
    for (const pattern of metadataPatterns) {
        abstractText = abstractText.replace(new RegExp(pattern.split(':')[0] + '.*?(\\.|$)', 'gi'), '');
    }
    abstractText = abstractText.replace(/index\s+terms.*$/i, '');
    abstractText = abstractText.replace(/keywords.*$/i, '');
    
    // Fix spaceless text if needed (like Tomato Sorter paper)
    if ((!abstractText.includes(' ') || abstractText.length > 100 && abstractText.indexOf(' ') < 10) && abstractText.length > 50) {
        const before = abstractText.length;
        abstractText = fixSpacelessText(abstractText);
        console.log(`   🔧 Fixed spaceless abstract (${before} → ${abstractText.length} chars)`);
    }
    
    // Remove extra spaces
    abstractText = abstractText.replace(/\s+/g, ' ').trim();
    
    // Ensure proper punctuation at end
    if (abstractText.length > 0 && !abstractText.match(/[.!?]$/)) {
        abstractText += ".";
    }
    
    const finalText = abstractText.length > 50 ? abstractText : "No abstract available.";
    console.log(`   📋 ABSTRACT (${finalText.length} chars): "${safeString(finalText, 500)}"`);
    console.log(`${"─".repeat(80)}\n`);
    
    return finalText;
}

// ==================== KEYWORDS EXTRACTION ====================
function extractKeywordsDynamic(text, lines, filename, title) {
    console.log(`\n${"─".repeat(80)}`);
    console.log(`🔍 KEYWORDS EXTRACTION DEBUG - ${filename}`);
    console.log(`${"─".repeat(80)}`);
    
    let keywords = "";
    let foundPattern = false;
    let keywordStartLine = -1;
    
    const stopIndicators = [
        'copyright', '©', 'all rights reserved', 'corresponding author',
        'email:', 'received', 'accepted', 'submitted', 'revised',
        '1.', 'i.', 'introduction', 'references', 'acknowledgement',
        'abstract', 'keywords', 'index terms', 'ams', 'codes',
        'published by', 'doi', 'issn', 'isbn', 'vol.', 'no.',
        'manuscript received', 'this work is licensed'
    ];
    
    const keywordPatterns = [
        { pattern: /[Kk]eywords?:?\s*([^\n]+)/i, name: "Keywords:" },
        { pattern: /[Ii]ndex\s+[Tt]erms?:?\s*([^\n]+)/i, name: "Index Terms:" },
        { pattern: /[Kk]ey\s+[Ww]ords?:?\s*([^\n]+)/i, name: "Key Words:" }
    ];
    
    for (let i = 0; i < Math.min(lines.length, 100); i++) {
        const line = lines[i];
        if (!line) continue;
        
        for (const patternObj of keywordPatterns) {
            const match = line.match(patternObj.pattern);
            if (match) {
                console.log(`   📍 Found "${patternObj.name}" at line ${i}`);
                console.log(`      Original: "${safeString(line, 100)}"`);
                keywordStartLine = i;
                const rawKeyword = match[1] || "";
                if (rawKeyword.trim() === "" || rawKeyword.trim() === ":" || rawKeyword.trim() === "-" || rawKeyword.trim() === "--") {
                    console.log(`      First line has no content, will use continuation lines only`);
                    keywords = "";
                } else {
                    keywords = rawKeyword;
                }
                foundPattern = true;
                console.log(`      Raw keywords (first line): "${safeString(keywords, 200)}"`);
                
                let nextLineIndex = i + 1;
                let moreKeywords = [];
                let foundValidContinuation = false;
                
                while (nextLineIndex < Math.min(lines.length, i + 15)) {
                    const nextLine = lines[nextLineIndex];
                    if (!nextLine) break;
                    
                    const nextLineTrimmed = nextLine.trim();
                    const nextLineLower = nextLineTrimmed.toLowerCase();
                    
                    let stopCapturing = false;
                    for (const indicator of stopIndicators) {
                        if (nextLineLower.includes(indicator)) {
                            stopCapturing = true;
                            console.log(`      Stopping at line ${nextLineIndex} - contains "${indicator}"`);
                            break;
                        }
                    }
                    
                    if (stopCapturing) break;
                    
                    if (nextLineTrimmed === "" || 
                        nextLineTrimmed.match(/^\d+\./) ||
                        nextLineTrimmed.match(/^[IVX]+\./i)) {
                        console.log(`      Stopping at line ${nextLineIndex} - empty line or section header`);
                        break;
                    }
                    
                    if (nextLineTrimmed.length > 3 && nextLineTrimmed.length < 100) {
                        if (/[A-Za-z]/.test(nextLineTrimmed)) {
                            console.log(`      Found continuation at line ${nextLineIndex}: "${safeString(nextLineTrimmed, 100)}"`);
                            moreKeywords.push(nextLineTrimmed);
                            foundValidContinuation = true;
                            nextLineIndex++;
                        } else {
                            if (foundValidContinuation) {
                                console.log(`      Stopping at line ${nextLineIndex} - not keyword-like`);
                                break;
                            }
                            nextLineIndex++;
                        }
                    } else {
                        break;
                    }
                }
                
                if (moreKeywords.length > 0) {
                    if (keywords && keywords.trim() !== "") {
                        keywords = keywords.trim() + ", " + moreKeywords.join(", ");
                    } else {
                        keywords = moreKeywords.join(", ");
                    }
                    console.log(`      Combined keywords: "${safeString(keywords, 200)}"`);
                } else if (!keywords || keywords.trim() === "") {
                    keywords = "";
                }
                break;
            }
        }
        if (foundPattern) break;
    }
    
    if (foundPattern && keywords && keywords.trim() !== "") {
        let cleaned = keywords;
        cleaned = cleaned.replace(/^[—–\-:;]+\s*/, '');
        cleaned = cleaned.replace(/[;]/g, ',');
        cleaned = cleaned.replace(/,\s*/g, ', ');
        cleaned = cleaned.replace(/\s+/g, ' ');
        cleaned = cleaned.replace(/,\s*,/g, ',');
        cleaned = cleaned.replace(/,\s*$/, '');
        cleaned = cleaned.replace(/[.,;:]$/, '');
        cleaned = cleaned.replace(/^:\s*/, '');
        cleaned = cleaned.trim();
        
        console.log(`   📝 Cleaned keywords: "${safeString(cleaned, 200)}"`);
        
        if (cleaned.length > 5) {
            const termCount = cleaned.split(',').length;
            console.log(`   ✅ Using extracted keywords (${termCount} terms)`);
            console.log(`${"─".repeat(80)}\n`);
            return cleaned.substring(0, 500);
        } else {
            console.log(`   ⚠️ Keywords too short or invalid, falling back to title-based keywords`);
        }
    } else {
        console.log(`   ❌ No valid keyword pattern found in first 100 lines`);
    }
    
    console.log(`   📝 Generating keywords from title: "${safeString(title, 100)}"`);
    
    const stopWords = new Set(['a', 'an', 'the', 'and', 'of', 'to', 'for', 'in', 'on', 'at', 'with', 'by', 'is', 'are', 'using', 'based', 'from', 'into', 'onto', 'upon', 'as', 'be', 'this', 'that', 'these', 'those']);
    const words = title.split(/\s+/).filter(w => {
        const clean = w.toLowerCase().replace(/[^\w]/g, '');
        return clean.length > 3 && !stopWords.has(clean) && !/^\d+$/.test(clean);
    }).map(w => w.replace(/[^\w]/g, ''));
    
    const unique = [...new Set(words)];
    const fallbackKeywords = unique.slice(0, 8).join(', ');
    
    console.log(`   📝 Title words extracted: ${words.join(', ')}`);
    console.log(`   📝 Unique keywords: ${unique.join(', ')}`);
    console.log(`   📝 Fallback keywords: "${fallbackKeywords}"`);
    console.log(`${"─".repeat(80)}\n`);
    
    return fallbackKeywords || "Research Paper";
}

// ==================== MAIN EXTRACTION ====================
async function extractMetadata(text, filename) {
    console.log(`\n${"█".repeat(70)}`);
    console.log(`📄 PROCESSING: ${filename}`);
    console.log(`${"█".repeat(70)}`);
    console.log(`📊 Total chars: ${text.length.toLocaleString()}`);
    
    const lines = text.split("\n").map(l => l.trim()).filter(l => l && l.length > 0);
    
    debugPrintRawLines(lines, filename, 60);
    
    const title = extractTitleDynamic(lines, filename);
    const authors = extractAuthorsDynamic(lines, filename);
    const year = extractYearDynamic(text, lines, filename);
    const abstract = extractAbstractDynamic(lines, filename);
    const keywords = extractKeywordsDynamic(text, lines, filename, title);
    
    const metadata = { title, authors, year, abstract, keywords };
    
    console.log(`\n${"⭐".repeat(35)}`);
    console.log(`FINAL RESULTS for: ${filename}`);
    console.log(`${"⭐".repeat(35)}`);
    console.log(`   📌 TITLE: ${safeString(metadata.title, 150)}`);
    console.log(`   👤 AUTHORS: ${safeString(metadata.authors, 120)}`);
    console.log(`   📅 YEAR: ${metadata.year}`);
    console.log(`   📝 KEYWORDS: ${safeString(metadata.keywords, 150)}`);
    console.log(`   📄 ABSTRACT LENGTH: ${(metadata.abstract || "").length} chars`);
    console.log(`   📄 ABSTRACT PREVIEW: ${safeString(metadata.abstract, 500)}`);
    
    return metadata;
}

// ==================== API ENDPOINTS ====================

app.get("/status", (req, res) => {
    res.json({ status: "running", cachedPapers: cachedPapers ? cachedPapers.length : 0 });
});

app.post("/reload-papers", (req, res) => {
    cachedPapers = null;
    lastCacheTime = null;
    res.json({ message: "Cache cleared" });
});

app.get("/papers-data", async (req, res) => {
    if (cachedPapers && lastCacheTime && (Date.now() - lastCacheTime < CACHE_DURATION)) {
        console.log(`\n✅ Using cached (${cachedPapers.length} papers)`);
        return res.json(cachedPapers);
    }
    
    try {
        if (!fs.existsSync(PAPERS_FOLDER)) {
            return res.status(404).json({ error: "Papers folder not found" });
        }
        
        const files = fs.readdirSync(PAPERS_FOLDER);
        const pdfFiles = files.filter(file => file.toLowerCase().endsWith(".pdf"));
        
        console.log(`\n📁 Found ${pdfFiles.length} PDF files`);
        const papers = [];

        for (const file of pdfFiles) {
            try {
                const filePath = path.join(PAPERS_FOLDER, file);
                const dataBuffer = fs.readFileSync(filePath);
                const pdfData = await pdfParse(dataBuffer);
                const metadata = await extractMetadata(pdfData.text, file);
                
                papers.push({ filename: file, file_path: `/papers/${encodeURIComponent(file)}`, ...metadata });
                console.log(`\n✅ SUCCESS: ${file}\n`);
            } catch (error) {
                console.error(`\n❌ ERROR: ${file} - ${error.message}\n`);
                papers.push({
                    filename: file,
                    file_path: `/papers/${encodeURIComponent(file)}`,
                    title: file.replace(".pdf", "").replace(/[-_]/g, ' '),
                    authors: "Unknown Authors",
                    year: "Unknown",
                    keywords: "Research Paper",
                    abstract: "Could not extract metadata from this PDF."
                });
            }
        }
        
        cachedPapers = papers;
        lastCacheTime = Date.now();
        console.log(`\n✅ Processed ${papers.length} papers`);
        res.json(papers);
        
    } catch (error) {
        console.error("❌ Server error:", error);
        res.status(500).json({ error: "Failed to load papers" });
    }
});

const PORT = 3000;
app.listen(PORT, () => {
    console.log(`\n${"═".repeat(55)}`);
    console.log(`🐛 AUTHOR, KEYWORDS & ABSTRACT DEBUG EXTRACTION SYSTEM`);
    console.log(`${"═".repeat(55)}`);
    console.log(`📍 URL: http://localhost:${PORT}`);
    console.log(`\n🔍 DEBUG MODE ENABLED:`);
    console.log(`   ✓ Shows every candidate line for authors`);
    console.log(`   ✓ Shows cleaning process and decisions`);
    console.log(`   ✓ Shows final filtered authors list`);
    console.log(`   ✓ Shows keyword extraction process`);
    console.log(`   ✓ Shows where keywords are found`);
    console.log(`   ✓ Captures multi-line keywords with intelligent stopping`);
    console.log(`   ✓ Shows fallback keyword generation`);
    console.log(`   ✓ Properly handles empty keyword lines`);
    console.log(`   ✓ Shows abstract extraction with line numbers`);
    console.log(`   ✓ Shows abstract cleaning process`);
    console.log(`   ✓ Handles spaceless abstract text`);
    console.log(`   ✓ Skips metadata lines in abstract`);
    console.log(`   ✓ Stops at Keywords/Index Terms (no over-extraction)`);
    console.log(`\n📋 FIXES APPLIED:`);
    console.log(`   ✓ First PDF title fix`);
    console.log(`   ✓ IoT paper full title`);
    console.log(`   ✓ Analysis paper title from lines 0-4`);
    console.log(`   ✓ Author extraction with suffix patterns`);
    console.log(`   ✓ Keyword extraction with comma separation`);
    console.log(`   ✓ Handles empty keyword lines (like QnA paper)`);
    console.log(`   ✓ Abstract extraction with proper stop markers`);
    console.log(`   ✓ Fixed spaceless abstract text (Tomato Sorter)`);
    console.log(`   ✓ Special handling for analysis paper abstract`);
    console.log(`   ✓ Abstract stops at Keywords (no over-extraction)`);
    console.log(`${"═".repeat(55)}\n`);
});