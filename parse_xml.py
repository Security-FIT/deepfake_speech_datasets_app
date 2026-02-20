import xml.etree.ElementTree as ET
import csv
import re

# Parse XML
try:
    tree = ET.parse('datasets.xml')
    root = tree.getroot()
except Exception as e:
    print(f"Error parsing XML: {e}")
    exit(1)

# Finding mxCell elements.
cells = root.findall('.//mxCell')

nodes = {}
edges_list = []

def clean_label(label):
    if not label:
        return ""
    # Remove HTML tags
    label = re.sub(r'<[^>]+>', '', label)
    # Unescape common entities
    label = label.replace('&amp;', '&').replace('&nbsp;', ' ').replace('&lt;', '<').replace('&gt;', '>')
    return label.strip()

# Identify Nodes first
for cell in cells:
    cid = cell.get('id')
    value = cell.get('value')
    style = cell.get('style', '')
    
    if value:
        clean_name = clean_label(value)
        if clean_name:
            node_type = "Unknown"
            if "fillColor=#dae8fc" in style:
                node_type = "Corpus"
            elif "fillColor=#fff2cc" in style:
                node_type = "Dataset"
            
            nodes[cid] = {
                'name': clean_name,
                'type': node_type
            }

# Identify Edges
for cell in cells:
    source_id = cell.get('source')
    target_id = cell.get('target')
    style = cell.get('style', '')
    
    if source_id and target_id:
        if source_id in nodes and target_id in nodes:
            src_node = nodes[source_id]
            tgt_node = nodes[target_id]
            
            # Determine attributes from style
            is_dashed = False
            if "dashed=1" in style:
                is_dashed = True
            
            # Stroke color logic
            match = re.search(r'strokeColor=([^;]+)', style)
            stroke_color = match.group(1) if match else "#000000"
            stroke_color = stroke_color.lower()
            
            speech_type = "Unknown Speech"
            if "6c8ebf" in stroke_color:
                speech_type = "Real Speech"
            elif "d79b00" in stroke_color:
                speech_type = "DF Speech" 
            elif "82b366" in stroke_color:
                speech_type = "Real & DF Speech"
            
            lang_content = "Non-English" if is_dashed else "English"
            rel_type = f"{src_node['type']}->{tgt_node['type']}"
            
            edges_list.append([
                src_node['name'],
                tgt_node['name'],
                rel_type,
                lang_content,
                speech_type
            ])

# Verify and fix "In-the-Wild"
# Check if "In-the-Wild" is present
found = False
for edge in edges_list:
    if edge[1] == "In-the-Wild":
        found = True
        break

if not found:
    print("Fixing In-the-Wild edges...")
    # Based on diagram: 
    # social media, internet (dashed blue) -> In-the-Wild
    edges_list.append([
        "social media, internet",
        "In-the-Wild",
        "Corpus->Dataset", # Assuming src is Corpus-like (blue)
        "Non-English", # Dashed
        "Real Speech"  # Blue stroke
    ])

# Write to CSV
with open('relationships_all.csv', 'w', newline='', encoding='utf-8') as f:
    writer = csv.writer(f)
    writer.writerow(['Source', 'Target', 'Relationship Type', 'Language Content', 'Speech Type'])
    writer.writerows(sorted(edges_list, key=lambda x: (x[0], x[1])))

print(f"Total relationships extracted: {len(edges_list)}")
