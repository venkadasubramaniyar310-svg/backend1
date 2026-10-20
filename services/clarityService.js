const db = require('../config/db');

/**
 * Curated knowledge base for instant academic conceptual clarity
 */
const KNOWLEDGE_BASE = [
    {
        keywords: ['acid', 'atomicity', 'consistency', 'isolation', 'durability', 'transaction', 'transactions'],
        topic: 'Database Transactions & ACID Properties',
        explanation: 'In DBMS, ACID properties guarantee database transactions are processed reliably:\n• **Atomicity**: The entire transaction completes or none of it does (all-or-nothing rollback).\n• **Consistency**: The database transitions only between valid states conforming to integrity constraints.\n• **Isolation**: Concurrently executing transactions operate independently without interference.\n• **Durability**: Once committed, transaction results survive system crashes and power failures.',
        subjectHint: 'Database Management Systems'
    },
    {
        keywords: ['normal', 'normalization', '1nf', '2nf', '3nf', 'bcnf', 'anomaly'],
        topic: 'Relational Database Normalization',
        explanation: 'Normalization organizes relational tables to minimize data redundancy and eliminate update/insertion/deletion anomalies:\n• **1NF**: Atomic attribute values; eliminates repeating groups.\n• **2NF**: In 1NF + no partial dependency (non-key attributes depend on entire composite key).\n• **3NF**: In 2NF + no transitive dependency (non-key attributes do not determine each other).\n• **BCNF**: Strict 3NF where every determinant is a super key.',
        subjectHint: 'Database Management Systems'
    },
    {
        keywords: ['tree', 'avl', 'bst', 'binary search', 'search tree', 'rotations'],
        topic: 'Balanced Search Trees (BST & AVL)',
        explanation: 'Binary Search Trees (BST) maintain order where left child < parent < right child. AVL trees are self-balancing BSTs where height differences between subtrees (Balance Factor) never exceed 1. Tree rotations (LL, RR, LR, RL) rebalance nodes in O(1), guaranteeing O(log n) search, insertion, and deletion complexity.',
        subjectHint: 'Data Structures and Algorithms'
    },
    {
        keywords: ['graph', 'dijkstra', 'shortest path', 'bellman', 'bfs', 'dfs'],
        topic: 'Graph Algorithms & Shortest Paths',
        explanation: 'Key graph algorithms:\n• **BFS**: Level-order search using a queue; finds unweighted shortest paths in O(V + E).\n• **DFS**: Depth exploration using recursion/stack; detects cycles and topological ordering.\n• **Dijkstra**: Greedy shortest-path algorithm for non-negative edge weights in O((V + E) log V).\n• **Bellman-Ford**: Dynamic programming approach accommodating negative edge weights in O(V × E).',
        subjectHint: 'Data Structures and Algorithms'
    },
    {
        keywords: ['deadlock', 'concurrency', 'semaphore', 'mutex', 'paging', 'virtual memory'],
        topic: 'Operating System Concurrency & Deadlocks',
        explanation: 'A deadlock occurs when processes wait indefinitely for resources held by each other. Four Coffman conditions must hold:\n1. Mutual Exclusion\n2. Hold and Wait\n3. No Preemption\n4. Circular Wait\nDeadlock prevention breaks at least one condition, while avoidance uses algorithms like Banker\'s Algorithm.',
        subjectHint: 'Operating Systems'
    },
    {
        keywords: ['syllabus', 'exam', 'midterm', 'schedule', 'portion', 'portions'],
        topic: 'Academic Syllabus & Exam Coverage',
        explanation: 'Official course syllabus documents, unit breakdowns, and weightage distribution for all departments are verified and cataloged in the repository under "Syllabus and Course Documents". Check the Browse Resources section filtered by your semester.',
        subjectHint: 'All Subjects'
    },
    {
        keywords: ['lab', 'manual', 'exercise', 'experiment', 'practical', 'code'],
        topic: 'Laboratory Manuals & Experiments',
        explanation: 'Verified laboratory manuals with step-by-step algorithms, sample inputs, and expected outputs are available in the repository. Select Resource Type: "Laboratory Manuals" in the search filters to download complete course manuals.',
        subjectHint: 'All Subjects'
    },
    {
        keywords: ['question paper', 'previous year', 'answer key', 'solutions', 'pyq', 'key'],
        topic: 'Previous-Year Exam Papers & Solutions',
        explanation: 'End-semester solved question papers and faculty answer keys can be downloaded under "Previous-Year Question Papers" and "Question Banks". If a specific year is missing, submit a quick request from your student portal.',
        subjectHint: 'All Subjects'
    }
];

/**
 * Generates automated clarity reply matching question and repository resources
 */
async function generateClarityReply(questionText, studentId, staffUser) {
    const text = questionText.toLowerCase();

    // 1. Find matching concept from knowledge base
    let matchedConcept = KNOWLEDGE_BASE.find(kb => 
        kb.keywords.some(kw => text.includes(kw))
    );

    // 2. Query published resources matching the question keywords
    const searchTerms = text.replace(/[^a-zA-Z0-9\s]/g, '').split(/\s+/).filter(w => w.length > 3);
    let matchedResources = [];

    if (searchTerms.length > 0) {
        const likeClauses = searchTerms.slice(0, 4).map(() => '(r.title LIKE ? OR r.description LIKE ?)').join(' OR ');
        const params = [];
        searchTerms.slice(0, 4).forEach(term => {
            params.push(`%${term}%`, `%${term}%`);
        });

        try {
            const [rows] = await db.query(
                `SELECT r.id, r.title, s.name AS subject_name, rt.name AS resource_type
                 FROM resources r
                 JOIN subjects s ON r.subject_id = s.id
                 JOIN resource_types rt ON r.resource_type_id = rt.id
                 WHERE r.status = 'PUBLISHED' AND (${likeClauses})
                 LIMIT 3`,
                params
            );
            matchedResources = rows;
        } catch (e) {
            console.error('Resource match error in clarity engine:', e.message);
        }
    }

    // 3. Assemble Clarity Reply
    let reply = `🤖 **Automated Doubt Clarity Assistant**\n*(Instant Academic Support on behalf of ${staffUser.name})*\n\n`;

    if (matchedConcept) {
        reply += `### 💡 Concept Clarity: ${matchedConcept.topic}\n${matchedConcept.explanation}\n\n`;
    } else {
        try {
            const aiService = require('./aiService');
            const dynamicSolve = await aiService.solveConceptClarity({
                subject: 'Computer Science & Engineering',
                query: questionText,
                depth: 'simple'
            });
            if (dynamicSolve && dynamicSolve.breakdown) {
                reply += `${dynamicSolve.breakdown}\n\n`;
                if (dynamicSolve.practicalExample) {
                    reply += `${dynamicSolve.practicalExample}\n\n`;
                }
            } else {
                reply += `Hello! Thank you for reaching out. ${staffUser.name} has received your doubt query and will provide further details shortly.\n\n`;
            }
        } catch (err) {
            reply += `Hello! Thank you for reaching out. ${staffUser.name} has received your doubt query and will provide further details shortly.\n\n`;
        }
    }

    if (matchedResources.length > 0) {
        reply += `📚 **Recommended Study Materials in Repository:**\n`;
        matchedResources.forEach(res => {
            reply += `• [${res.resource_type}] **${res.title}** (${res.subject_name})\n`;
        });
        reply += `\n*You can view and download these directly from the Browse Resources portal.*\n\n`;
    }

    reply += `*Feel free to ask follow-up questions if you need further clarification!*`;

    return reply;
}

module.exports = {
    generateClarityReply,
    KNOWLEDGE_BASE
};
