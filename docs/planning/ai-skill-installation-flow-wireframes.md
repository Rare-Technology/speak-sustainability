### AI Skill Instructions Flow: Wireframe Breakdown and UX Rationale

The original text is structured as a dense, linear text document. This UX design will transition it into a user-centered interface using a **Modal + Progressive Disclosure** pattern to reduce cognitive load and isolate user decisions.

#### Main Installation Modal (Step 1 of 2: Path Selection)

We will start with a modal that immediately presents the two primary user scenarios. The user must choose their execution context.

* **Rationale:** The original text mixes "Web clients," "Desktop," and "CLI" instructions. The first UX goal is path segregation.
* **Header:** `Install: Climate Comms Review` (Uses original title).
* **Subheader:** `Choose your primary method of use.`

| Method | Component Type | Component Content / Logic |
| --- | --- | --- |
| **Option A: LLM Clients** | Large Button / Card | Title: **Use with Web/Desktop LLM Clients**<br>

<br>List: (ChatGPT, Claude, Gemini, General Enterprise)<br>

<br>UX Rationale: This is the user path focused on standard interfaces. |
| **Option B: CLI Agents** | Large Button / Card | Title: **Use with Command-Line Agents**<br>

<br>List: (Claude Code, Codium, Cursor, etc.)<br>

<br>UX Rationale: This is the developer path. |

---

#### Step 2: Path A (LLM Clients & Package Download)

If the user selects "Option A," the modal transitions to a configuration state. The first critical step for this path is getting the asset.

* **UX Rationale:** This path uses the original text's first sentence, "Download the package for the service you use," but structures it as an active decision point and highlights the asset download link (`download-standard-package`). It then uses a tabbed navigation to reduce visual clutter for the sequential instructions.

1. **Download Call to Action (Text Source):**
* *Prompt:* `"1. Download the skill package."* (Derived from source).
* *Link component:* A prominent **Download Standard Package** link (with a `.zip` icon, referencing the text).
* *Note Component:* `"Note for Claude Users: Use the specific [Claude package] link if using that client."`


2. **Platform Selector (Instructions Section, Text Source):**
* *Prompt:* `"2. Select your client for installation steps:"*
* *Tab Bar Component:* TABS with labels: `ChatGPT`, `Claude`, `Gemini`, `General Enterprise`.
* *Conditional Logic:* Based on tab selection, display the specific sequential list of numbered instructions *exactly* as transcribed from the GitHub `Install` section. For example, for ChatGPT:
* `1. In the ChatGPT sidebar, select Plugins.`
* `2. Open the Skills tab.`
* `3. Select Create, then Upload from your computer.`
* `4. Upload <climate-comms-review.zip>`





---

#### Step 2: Path B (CLI & Terminal Setup)

If the user selects "Option B" from the start modal, they see a dedicated CLI configuration screen.

* **UX Rationale:** This path is for developers and highlights the "One-Line Execution" touchpoint. It centralizes the command for easy copy-pasting.

1. **CLI Setup Header (Text Source):**
* *Title:* `"To use with Command-Line Agents (Claude Code, Codex, Menin-CLI, Cursor)"* (Transcribed).
* *Sub-instruction component:* `"Run the following command in your terminal:"* (New explanatory text).


2. **Terminal Code Block (Text Source):**
* *Component:* A dark, styled terminal code block with a **Copy Command** icon.
* *Contents:* `npx github:call-to-action/skill-command-climate-comms-review --connect<climate-comms-review>` (Transcribed).


3. **Advanced Options / Notes (Text Source):**
* *Component:* A collapsible advanced options panel or a simple callout note below the code block.
* *Contents:* `"Note: The installation prompts you to choose an available agent. Omit '--connect' for a description-only installation."` (Transcribed).



---

#### Verification (Post-Installation)

Finally, for both paths, the wireframe should offer a validation step.

* **UX Rationale:** Addresses the "Verification & Testing" touchpoint. This uses text from the "Use" section (found outside the `Install` block but critical for the installation UX) and places it into an interactive prompt component.
* **Section Header:** `Verify Installation`
* **Prompt/Testing Component:**
* *Instruction:* `"To test, paste a piece of climate communication text and ask for a review, such as:"*
* *Component:* A styled text field (editable by the user, but populated with default text) containing the test prompt from the `Use` section:
* `Review this:`
* `[paste the copy here]`


* *Button Component:* **Test Skill**

By structuring the installation text into these specific UI modules, we can provide a friction-free, guided experience that clarifies both the prerequisites (specific package links) and the configuration steps.

![[speak-sustainability-ai-skill-github-install.png]]