document.addEventListener('DOMContentLoaded', async () => {
    try {
        const [corporaRes, datasetsRes, relationshipsRes] = await Promise.all([
            fetch('corpora.csv'),
            fetch('datasets.csv'),
            fetch('relationships_all.csv')
        ]);

        const corporaText = await corporaRes.text();
        const datasetsText = await datasetsRes.text();
        const relationshipsText = await relationshipsRes.text();

        // Parse CSVs
        const corporaData = Papa.parse(corporaText, { header: true, delimiter: '|', skipEmptyLines: true }).data;
        const datasetsData = Papa.parse(datasetsText, { header: true, delimiter: ',', skipEmptyLines: true }).data;
        const relationshipsData = Papa.parse(relationshipsText, { header: true, delimiter: ',', skipEmptyLines: true }).data;

        // --- Tabulator ---
        const tableData = datasetsData.map(row => ({
            ...row,
            id: row.Dataset // Add ID for Tabulator if needed, though mostly for tracking
        }));

        new Tabulator("#table", {
            data: tableData,
            layout: "fitColumns",
            height: "100%",
            columns: [
                { title: "Dataset", field: "Dataset", widthGrow: 1.2 },
                { title: "Year", field: "Year", width: 70 },
                { title: "Access", field: "Accessibility", width: 80 },
                { title: "DF Tools", field: "DF tools", width: 90 },
                { title: "Lang", field: "Language", width: 70 },
                { title: "Utterances", field: "Utterances", width: 110, hozAlign: "right" },
                { title: "Speakers (M+F)", field: "Speakers (M+F)", hozAlign: "right" },
                { title: "License", field: "License" },
            ],
        });

        // --- Search Functionality ---
        const table = Tabulator.findTable("#table")[0];
        document.getElementById('searchBox').addEventListener('input', (e) => {
            const value = e.target.value;
            if (value) {
                table.setFilter([
                    [
                        { field: "Dataset", type: "like", value: value },
                        { field: "Year", type: "like", value: value },
                        { field: "Accessibility", type: "like", value: value },
                        { field: "License", type: "like", value: value },
                    ]
                ]);
            } else {
                table.clearFilter();
            }
        });

        initGraph(corporaData, datasetsData);

    } catch (err) {
        console.error('Error loading data:', err);
    }
});

function initGraph(corporaData, datasetsData) {
    // 1. Prepare elements (nodes)
    const elements = [];
    const years = new Set();
    
    // Helper to normalize year
    const parseYear = (y) => {
        if (!y) return null;
        // Check for special format "None (YYYY)" first
        const specialMatch = y.toString().match(/None \((\d{4})\)/);
        if (specialMatch) {
             const yearInt = parseInt(specialMatch[1]);
             return { year: yearInt <= 2015 ? 2015 : yearInt, isSpecial: true };
        }

        const yearInt = parseInt(y);
        if (isNaN(yearInt)) return null;
        return { year: yearInt <= 2015 ? 2015 : yearInt, isSpecial: false };
    };

    // Process corpora
    corporaData.forEach(c => {
        const res = parseYear(c.Year);
        if (res) {
            years.add(res.year);
            elements.push({
                data: { 
                    id: c.Corpus, 
                    label: c.Corpus, 
                    year: res.year, 
                    type: res.isSpecial ? 'special-corpus' : 'corpus' 
                }
            });
        }
    });

    // Process datasets
    datasetsData.forEach(d => {
        const res = parseYear(d.Year);
        if (res) {
            years.add(res.year);
            // Prefix to avoid ID collisions with corpora if names overlap
            elements.push({
                data: { id: `ds_${d.Dataset}`, label: d.Dataset, year: res.year, type: 'dataset' }
            });
        }
    });

    // Add Year nodes (timeline)
    const sortedYears = Array.from(years).sort((a, b) => a - b);
    
    // Add timeline nodes
    sortedYears.forEach(year => {
        const label = year === 2015 ? "2015 and older" : `${year}`;
         elements.push({
            data: { id: `year-${year}`, label: label, type: 'timeline', year: year }
        });
    });

    // 2. Initialize Cytoscape
    const cy = cytoscape({
        container: document.getElementById('cy'),
        elements: elements,
        style: [
            {
                selector: 'node[type="corpus"]',
                style: {
                    'background-color': '#dae8fc',
                    'border-color': '#6c8ebf',
                    'border-width': 1,
                    'label': 'data(label)',
                    'text-valign': 'center',
                    'text-halign': 'center',
                    'font-size': '10px',
                    'text-wrap': 'wrap',
                    'text-max-width': '100px',
                    'width': 'label',
                    'height': 'label',
                    'padding': 8,
                    'shape': 'round-rectangle'
                }
            },
            {
                selector: 'node[type="special-corpus"]',
                style: {
                    'background-color': 'white',
                    'border-width': 0,
                    'label': 'data(label)',
                    'text-valign': 'center',
                    'text-halign': 'center',
                    'font-size': '10px',
                    'font-style': 'italic',
                    'color': '#000000',
                    'text-wrap': 'wrap',
                    'text-max-width': '100px',
                    'width': 'label',
                    'height': 'label',
                    'padding': 5,
                    'shape': 'rectangle'
                }
            },
            {
                selector: 'node[type="dataset"]',
                style: {
                    'background-color': '#fff2cc',
                    'border-color': '#d6b656',
                    'border-width': 1,
                    'label': 'data(label)',
                    'text-valign': 'center',
                    'text-halign': 'center',
                    'font-size': '10px',
                    'text-wrap': 'wrap',
                    'text-max-width': '100px',
                    'width': 'label',
                    'height': 'label',
                    'padding': 8,
                    'shape': 'round-rectangle'
                }
            },
            {
                selector: 'node[type="timeline"]',
                style: {
                    'background-color': '#f8f9fa', 
                    'border-width': 0,
                    'label': 'data(label)',
                    'text-valign': 'center',
                    'text-halign': 'center',
                    'font-size': '12px',
                    'font-weight': 'bold',
                    'color': '#333',
                    'width': 'label',
                    'height': 20,
                    'padding': 5,
                    'shape': 'rectangle'
                }
            }
        ],
        layout: {
            name: 'preset' 
        }
    });

    // 3. Position nodes with dynamic height
    let currentY = 50;
    const timelineX = 50; 
    const contentStartX = 160; 
    const spacing = 120; 
    const rowHeight = 80; 
    const itemsPerRow = 1000; 

    sortedYears.forEach(year => {
        // Find all types for this year
        const nodes = cy.nodes().filter(ele => 
            (ele.data('type') === 'corpus' || ele.data('type') === 'dataset' || ele.data('type') === 'special-corpus') 
            && ele.data('year') === year
        );
        
        const nodesArray = nodes.toArray().sort((a, b) => a.data('label').localeCompare(b.data('label')));
        
        const count = nodesArray.length;
        const yearBlockHeight = rowHeight; 

        // Position Timeline Node
        const timelineNode = cy.nodes().filter(ele => ele.data('type') === 'timeline' && ele.data('year') === year);
        timelineNode.position({ 
            x: timelineX, 
            y: currentY + (yearBlockHeight / 2) 
        });

        // Position Content Nodes
        if (count > 0) {
            nodesArray.forEach((node, i) => {
                 const col = i;
                 
                 node.position({
                     x: contentStartX + (col * spacing),
                     y: currentY + (yearBlockHeight / 2)
                 });
            });
        }
        
        // Advance Y for next year
        currentY += yearBlockHeight;
    });
    
    cy.fit();
    cy.center();
}
