#!/usr/bin/env python3
"""
Convert spec YAML from old format to new compact format.

Old format:
  requirements:
    - id: some-id
      strength: MUST
      statement: "..."
      scenarios:
        - id: scenario-id
          steps:
            - kind: GIVEN
              text: "..."

New format:
  requirements:
    some-id:
      strength: MUST
      statement: "..."
      scenarios:
        scenario-id:
          - GIVEN: "..."
          - WHEN: "..."
"""

import re
import sys
from pathlib import Path


def convert_yaml_text(content: str) -> str:
    """Convert YAML content from old to new format."""
    lines = content.split('\n')
    output = []
    i = 0

    while i < len(lines):
        line = lines[i]

        # Keep header as-is
        if not line.startswith('  - id:'):
            output.append(line)
            i += 1
            continue

        # We're at the start of requirements section
        # Extract requirement id
        req_id = line.split('id:')[1].strip()
        output.append(f'  {req_id}:')
        i += 1

        # Skip the old id line and process strength, statement, scenarios
        while i < len(lines):
            line = lines[i]

            # End of requirements
            if not line.startswith('    ') and not line.startswith('  -') and not line.startswith('  '):
                break

            # Skip the id field
            if line.strip().startswith('id:'):
                i += 1
                continue

            # Process strength and statement (keep as-is but remove one indent)
            if line.strip().startswith('strength:') or line.strip().startswith('statement:'):
                output.append(line)
                i += 1
                continue

            # Process scenarios section
            if line.strip().startswith('scenarios:'):
                output.append('    scenarios:')
                i += 1

                # Process each scenario
                while i < len(lines):
                    line = lines[i]

                    # End of scenarios
                    if not line.startswith('      '):
                        break

                    # Start of a scenario
                    if line.strip().startswith('- id:'):
                        scenario_id = line.split('id:')[1].strip()
                        output.append(f'      {scenario_id}:')
                        i += 1

                        # Process steps
                        if i < len(lines) and lines[i].strip().startswith('steps:'):
                            i += 1  # skip 'steps:' line

                            # Process each step
                            while i < len(lines):
                                step_line = lines[i]

                                # End of steps
                                if not step_line.startswith('          '):
                                    break

                                # Step item
                                if step_line.strip().startswith('- kind:'):
                                    kind = step_line.split('kind:')[1].strip()
                                    i += 1
                                    if i < len(lines):
                                        text_line = lines[i]
                                        if text_line.strip().startswith('text:'):
                                            text = text_line.split('text:', 1)[1].strip()
                                            # Determine quoting
                                            if ':' in text or text.startswith('"') or text.startswith("'"):
                                                output.append(f'        - {kind}: {text}')
                                            else:
                                                output.append(f'        - {kind}: "{text}"')
                                    i += 1
                                else:
                                    break
                            continue
                    else:
                        break
                continue

            i += 1
            continue

    return '\n'.join(output)


def main():
    if len(sys.argv) != 3:
        print(f"Usage: {sys.argv[0]} <input.yaml> <output.yaml>")
        sys.exit(1)

    input_path = Path(sys.argv[1])
    output_path = Path(sys.argv[2])

    if not input_path.exists():
        print(f"Error: Input file {input_path} does not exist")
        sys.exit(1)

    with open(input_path, 'r') as f:
        content = f.read()

    # Split at requirements section
    if 'requirements:' in content:
        header_end = content.index('requirements:')
        header = content[:header_end + len('requirements:')]
        req_section = content[header_end + len('requirements:'):]

        # Convert requirements section
        converted_reqs = convert_yaml_text('requirements:' + req_section)

        # Remove the duplicate 'requirements:' prefix
        converted_content = header + '\n' + converted_reqs.split('requirements:', 1)[1]
    else:
        converted_content = content

    with open(output_path, 'w') as f:
        f.write(converted_content)

    print(f"Converted {input_path} -> {output_path}")


if __name__ == '__main__':
    main()
