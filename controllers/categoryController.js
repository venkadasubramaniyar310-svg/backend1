const db = require('../config/db');

// ==========================================
// DEPARTMENTS
// ==========================================

const getDepartments = async (req, res) => {
    try {
        const [rows] = await db.query(
            `SELECT d.id, d.name, d.created_at, COUNT(s.id) AS subject_count
             FROM departments d
             LEFT JOIN subjects s ON d.id = s.department_id
             GROUP BY d.id
             ORDER BY d.name ASC`
        );
        return res.json({ departments: rows });
    } catch (error) {
        console.error('Error fetching departments:', error);
        return res.status(500).json({ error: 'Failed to retrieve departments.' });
    }
};

const createDepartment = async (req, res) => {
    try {
        const { name } = req.body;
        if (!name || !name.trim()) {
            return res.status(400).json({ error: 'Department name is required.' });
        }

        const [existing] = await db.query('SELECT id FROM departments WHERE name = ?', [name.trim()]);
        if (existing.length > 0) {
            return res.status(409).json({ error: 'Department with this name already exists.' });
        }

        const [result] = await db.query('INSERT INTO departments (name) VALUES (?)', [name.trim()]);
        return res.status(201).json({
            message: 'Department created successfully.',
            department: { id: result.insertId, name: name.trim() }
        });
    } catch (error) {
        console.error('Error creating department:', error);
        return res.status(500).json({ error: 'Failed to create department.' });
    }
};

const updateDepartment = async (req, res) => {
    try {
        const { id } = req.params;
        const { name } = req.body;

        if (!name || !name.trim()) {
            return res.status(400).json({ error: 'Department name is required.' });
        }

        await db.query('UPDATE departments SET name = ? WHERE id = ?', [name.trim(), id]);
        return res.json({ message: 'Department updated successfully.', department: { id, name: name.trim() } });
    } catch (error) {
        console.error('Error updating department:', error);
        return res.status(500).json({ error: 'Failed to update department.' });
    }
};

const deleteDepartment = async (req, res) => {
    try {
        const { id } = req.params;

        // Check if department has subjects
        const [subjects] = await db.query('SELECT id FROM subjects WHERE department_id = ? LIMIT 1', [id]);
        if (subjects.length > 0) {
            return res.status(400).json({
                error: 'Cannot delete department with associated subjects. Reassign or delete them first.'
            });
        }

        await db.query('DELETE FROM departments WHERE id = ?', [id]);
        return res.json({ message: 'Department deleted successfully.' });
    } catch (error) {
        console.error('Error deleting department:', error);
        return res.status(500).json({ error: 'Failed to delete department.' });
    }
};

// ==========================================
// SUBJECTS
// ==========================================

const getSubjects = async (req, res) => {
    try {
        const { department_id, year, semester } = req.query;
        const conditions = [];
        const params = [];

        if (department_id) {
            conditions.push('s.department_id = ?');
            params.push(department_id);
        }
        if (year) {
            conditions.push('s.year = ?');
            params.push(year);
        }
        if (semester) {
            conditions.push('s.semester = ?');
            params.push(semester);
        }

        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

        const [rows] = await db.query(
            `SELECT 
                s.id,
                s.name,
                s.department_id,
                d.name AS department_name,
                s.year,
                s.semester,
                s.created_at,
                COUNT(r.id) AS resource_count
             FROM subjects s
             JOIN departments d ON s.department_id = d.id
             LEFT JOIN resources r ON s.id = r.subject_id
             ${whereClause}
             GROUP BY s.id
             ORDER BY s.name ASC`,
            params
        );

        return res.json({ subjects: rows });
    } catch (error) {
        console.error('Error fetching subjects:', error);
        return res.status(500).json({ error: 'Failed to retrieve subjects.' });
    }
};

const createSubject = async (req, res) => {
    try {
        const { name, department_id, year, semester } = req.body;

        if (!name || !name.trim()) return res.status(400).json({ error: 'Subject name is required.' });
        if (!department_id) return res.status(400).json({ error: 'Department ID is required.' });
        if (!year || !year.trim()) return res.status(400).json({ error: 'Year is required (e.g. II Year).' });
        if (!semester || !semester.trim()) return res.status(400).json({ error: 'Semester is required (e.g. Semester 3).' });

        // Verify department exists
        const [dept] = await db.query('SELECT id FROM departments WHERE id = ?', [department_id]);
        if (dept.length === 0) {
            return res.status(400).json({ error: 'Selected department does not exist.' });
        }

        const [result] = await db.query(
            'INSERT INTO subjects (name, department_id, year, semester) VALUES (?, ?, ?, ?)',
            [name.trim(), department_id, year.trim(), semester.trim()]
        );

        return res.status(201).json({
            message: 'Subject created successfully.',
            subject: {
                id: result.insertId,
                name: name.trim(),
                department_id,
                year: year.trim(),
                semester: semester.trim()
            }
        });
    } catch (error) {
        console.error('Error creating subject:', error);
        return res.status(500).json({ error: 'Failed to create subject.' });
    }
};

const updateSubject = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, department_id, year, semester } = req.body;

        const [existing] = await db.query('SELECT * FROM subjects WHERE id = ?', [id]);
        if (existing.length === 0) {
            return res.status(404).json({ error: 'Subject not found.' });
        }

        const subj = existing[0];
        const newName = name !== undefined ? name.trim() : subj.name;
        const newDept = department_id !== undefined ? department_id : subj.department_id;
        const newYear = year !== undefined ? year.trim() : subj.year;
        const newSem = semester !== undefined ? semester.trim() : subj.semester;

        await db.query(
            'UPDATE subjects SET name = ?, department_id = ?, year = ?, semester = ? WHERE id = ?',
            [newName, newDept, newYear, newSem, id]
        );

        return res.json({
            message: 'Subject updated successfully.',
            subject: { id, name: newName, department_id: newDept, year: newYear, semester: newSem }
        });
    } catch (error) {
        console.error('Error updating subject:', error);
        return res.status(500).json({ error: 'Failed to update subject.' });
    }
};

const deleteSubject = async (req, res) => {
    try {
        const { id } = req.params;

        const [resources] = await db.query('SELECT id FROM resources WHERE subject_id = ? LIMIT 1', [id]);
        if (resources.length > 0) {
            return res.status(400).json({
                error: 'Cannot delete subject that has resources linked to it.'
            });
        }

        await db.query('DELETE FROM subjects WHERE id = ?', [id]);
        return res.json({ message: 'Subject deleted successfully.' });
    } catch (error) {
        console.error('Error deleting subject:', error);
        return res.status(500).json({ error: 'Failed to delete subject.' });
    }
};

// ==========================================
// RESOURCE TYPES
// ==========================================

const getResourceTypes = async (req, res) => {
    try {
        const [rows] = await db.query(
            `SELECT rt.id, rt.name, rt.created_at, COUNT(r.id) AS resource_count
             FROM resource_types rt
             LEFT JOIN resources r ON rt.id = r.resource_type_id
             GROUP BY rt.id
             ORDER BY rt.name ASC`
        );
        return res.json({ resourceTypes: rows });
    } catch (error) {
        console.error('Error fetching resource types:', error);
        return res.status(500).json({ error: 'Failed to retrieve resource types.' });
    }
};

const createResourceType = async (req, res) => {
    try {
        const { name } = req.body;
        if (!name || !name.trim()) {
            return res.status(400).json({ error: 'Resource type name is required.' });
        }

        const [existing] = await db.query('SELECT id FROM resource_types WHERE name = ?', [name.trim()]);
        if (existing.length > 0) {
            return res.status(409).json({ error: 'Resource type already exists.' });
        }

        const [result] = await db.query('INSERT INTO resource_types (name) VALUES (?)', [name.trim()]);
        return res.status(201).json({
            message: 'Resource type created successfully.',
            resourceType: { id: result.insertId, name: name.trim() }
        });
    } catch (error) {
        console.error('Error creating resource type:', error);
        return res.status(500).json({ error: 'Failed to create resource type.' });
    }
};

const updateResourceType = async (req, res) => {
    try {
        const { id } = req.params;
        const { name } = req.body;

        if (!name || !name.trim()) {
            return res.status(400).json({ error: 'Resource type name is required.' });
        }

        await db.query('UPDATE resource_types SET name = ? WHERE id = ?', [name.trim(), id]);
        return res.json({ message: 'Resource type updated successfully.', resourceType: { id, name: name.trim() } });
    } catch (error) {
        console.error('Error updating resource type:', error);
        return res.status(500).json({ error: 'Failed to update resource type.' });
    }
};

const deleteResourceType = async (req, res) => {
    try {
        const { id } = req.params;

        const [resources] = await db.query('SELECT id FROM resources WHERE resource_type_id = ? LIMIT 1', [id]);
        if (resources.length > 0) {
            return res.status(400).json({
                error: 'Cannot delete resource type currently in use by existing resources.'
            });
        }

        await db.query('DELETE FROM resource_types WHERE id = ?', [id]);
        return res.json({ message: 'Resource type deleted successfully.' });
    } catch (error) {
        console.error('Error deleting resource type:', error);
        return res.status(500).json({ error: 'Failed to delete resource type.' });
    }
};

// ==========================================
// ACADEMIC YEARS
// ==========================================

const getAcademicYears = async (req, res) => {
    try {
        const [rows] = await db.query(
            'SELECT DISTINCT academic_year FROM resources WHERE academic_year IS NOT NULL AND academic_year != "" ORDER BY academic_year DESC'
        );

        // Include default academic years if table is empty or newly seeded
        const defaultYears = ['2026-27', '2025-26', '2024-25', '2023-24'];
        const existingYears = rows.map(r => r.academic_year);
        const combined = Array.from(new Set([...existingYears, ...defaultYears]));

        return res.json({ academicYears: combined });
    } catch (error) {
        console.error('Error fetching academic years:', error);
        return res.status(500).json({ error: 'Failed to retrieve academic years.' });
    }
};

module.exports = {
    getDepartments,
    createDepartment,
    updateDepartment,
    deleteDepartment,
    getSubjects,
    createSubject,
    updateSubject,
    deleteSubject,
    getResourceTypes,
    createResourceType,
    updateResourceType,
    deleteResourceType,
    getAcademicYears
};
