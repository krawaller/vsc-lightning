import * as vscode from "vscode";
import { playSound } from "../utils/sound-manager";

// Function to show quiz in actual modal dialogs
export async function showQuizDialog(quizItem: any) {
  // Combine and randomize answers
  const allAnswers = [
    ...quizItem.correctAnswers.map((answer: string) => ({
      text: answer,
      correct: true,
    })),
    ...quizItem.wrongAnswers.map((answer: string) => ({
      text: answer,
      correct: false,
    })),
  ];

  // Shuffle the answers
  for (let i = allAnswers.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [allAnswers[i], allAnswers[j]] = [allAnswers[j], allAnswers[i]];
  }

  // Use a simple approach with showInformationMessage and hope for the best alignment
  const questionAndAnswers =
    `${quizItem.question}\n\n` +
    allAnswers
      .map((answer, index) => `${index + 1}. ${answer.text}`)
      .join("\n");

  // Show initial dialog
  const action = await vscode.window.showInformationMessage(
    questionAndAnswers,
    { modal: true },
    "Reveal Answers"
  );

  if (action === "Reveal Answers") {
    // Play reveal sound if specified
    if (quizItem.revealSoundPath) {
      playSound(quizItem.revealSoundPath);
    }

    // Show revealed answers
    const revealedContent =
      `${quizItem.question}\n\n` +
      allAnswers
        .map((answer, index) => {
          const icon = answer.correct ? "✅" : "❌";
          return `${icon} ${index + 1}. ${answer.text}`;
        })
        .join("\n");

    await vscode.window.showInformationMessage(revealedContent, {
      modal: true,
    });
  }
}

// Function to show quiz in menu format (QuickPick)
export async function showQuizMenu(quizItem: any) {
  // Combine and randomize answers
  const allAnswers = [
    ...quizItem.correctAnswers.map((answer: string) => ({
      text: answer,
      correct: true,
    })),
    ...quizItem.wrongAnswers.map((answer: string) => ({
      text: answer,
      correct: false,
    })),
  ];

  // Shuffle the answers
  for (let i = allAnswers.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [allAnswers[i], allAnswers[j]] = [allAnswers[j], allAnswers[i]];
  }

  // Create the quiz content for the dialog
  const questionText =
    `${quizItem.question}\n\n` +
    allAnswers
      .map((answer, index) => `${index + 1}. ${answer.text}`)
      .join("\n");

  // Show initial dialog with question and answers using QuickPick for better text alignment
  const quickPick = vscode.window.createQuickPick();
  quickPick.title = quizItem.question;
  quickPick.placeholder = "Select 'Reveal Answers' to see the correct answers";
  quickPick.items = [
    ...allAnswers.map((answer, index) => ({
      label: `${index + 1}. ${answer.text}`,
      detail: "", // We'll update this after reveal
    })),
    { label: "$(eye) Reveal Answers", detail: "Click to show correct answers" },
  ];
  quickPick.canSelectMany = false;

  quickPick.onDidAccept(() => {
    const selected = quickPick.selectedItems[0];
    if (selected && selected.label.includes("Reveal Answers")) {
      quickPick.hide();
      // Show revealed answers in a new QuickPick
      showRevealedAnswers(quizItem.question, allAnswers, quizItem);
    }
  });

  quickPick.show();
}

// Function to show revealed answers with correct/incorrect indicators
function showRevealedAnswers(
  question: string,
  allAnswers: any[],
  quizItem?: any
) {
  // Play reveal sound if specified
  if (quizItem && quizItem.revealSoundPath) {
    playSound(quizItem.revealSoundPath);
  }

  const revealQuickPick = vscode.window.createQuickPick();
  revealQuickPick.title = question;
  revealQuickPick.placeholder = "Quiz Results - Press Escape to close";
  revealQuickPick.items = allAnswers.map((answer, index) => {
    const icon = answer.correct ? "$(check)" : "$(x)";
    return {
      label: `${icon} ${index + 1}. ${answer.text}`,
      detail: "",
    };
  });
  revealQuickPick.canSelectMany = false;
  revealQuickPick.show();
}

// Function to show quiz dialog with randomized answers
export async function showQuizWebview(quizItem: any) {
  // Combine and randomize answers
  const allAnswers = [
    ...quizItem.correctAnswers.map((answer: string) => ({
      text: answer,
      correct: true,
    })),
    ...quizItem.wrongAnswers.map((answer: string) => ({
      text: answer,
      correct: false,
    })),
  ];

  // Shuffle the answers
  for (let i = allAnswers.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [allAnswers[i], allAnswers[j]] = [allAnswers[j], allAnswers[i]];
  }

  // Create the quiz panel
  const panel = vscode.window.createWebviewPanel(
    "lightningQuiz",
    `Quiz: ${quizItem.label}`,
    vscode.ViewColumn.One,
    {
      enableScripts: true,
      retainContextWhenHidden: true,
    }
  );

  // Set the webview content
  panel.webview.html = getQuizWebviewContent(quizItem.question, allAnswers);

  // Handle messages from the webview
  panel.webview.onDidReceiveMessage(
    (message) => {
      switch (message.command) {
        case "reveal":
          panel.webview.postMessage({
            command: "showAnswers",
            answers: allAnswers,
          });
          // Play reveal sound if specified
          if (quizItem.revealSoundPath) {
            playSound(quizItem.revealSoundPath);
          }
          return;
      }
    },
    undefined,
    []
  );
}

// Function to generate the webview HTML content
function getQuizWebviewContent(question: string, answers: any[]): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Lightning Quiz</title>
    <style>
        body {
            font-family: var(--vscode-font-family);
            font-size: var(--vscode-font-size);
            color: var(--vscode-foreground);
            background-color: var(--vscode-editor-background);
            padding: 20px;
            line-height: 1.6;
        }
        .question {
            font-size: 1.2em;
            font-weight: bold;
            margin-bottom: 20px;
            color: var(--vscode-textLink-foreground);
        }
        .answers {
            list-style: none;
            padding: 0;
        }
        .answer {
            padding: 10px;
            margin: 5px 0;
            background-color: var(--vscode-editor-inactiveSelectionBackground);
            border-radius: 5px;
            border-left: 3px solid var(--vscode-textBlockQuote-border);
        }
        .answer.correct {
            border-left-color: var(--vscode-gitDecoration-addedResourceForeground);
        }
        .answer.incorrect {
            border-left-color: var(--vscode-gitDecoration-deletedResourceForeground);
        }
        .reveal-btn {
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            padding: 10px 20px;
            border-radius: 5px;
            cursor: pointer;
            font-size: 1em;
            margin-top: 20px;
        }
        .reveal-btn:hover {
            background-color: var(--vscode-button-hoverBackground);
        }
        .icon {
            margin-right: 8px;
            font-weight: bold;
        }
        .correct-icon {
            color: var(--vscode-gitDecoration-addedResourceForeground);
        }
        .incorrect-icon {
            color: var(--vscode-gitDecoration-deletedResourceForeground);
        }
        .hidden {
            display: none;
        }
    </style>
</head>
<body>
    <div class="question">${question}</div>
    <ul class="answers">
        ${answers
          .map(
            (answer, index) =>
              `<li class="answer" id="answer-${index}">
             <span class="icon hidden" id="icon-${index}"></span>
             <span class="text">${answer.text}</span>
           </li>`
          )
          .join("")}
    </ul>
    <button class="reveal-btn" onclick="revealAnswers()">Reveal</button>

    <script>
        const vscode = acquireVsCodeApi();
        
        function revealAnswers() {
            vscode.postMessage({
                command: 'reveal'
            });
        }

        window.addEventListener('message', event => {
            const message = event.data;
            
            if (message.command === 'showAnswers') {
                message.answers.forEach((answer, index) => {
                    const answerElement = document.getElementById('answer-' + index);
                    const iconElement = document.getElementById('icon-' + index);
                    
                    if (answer.correct) {
                        answerElement.classList.add('correct');
                        iconElement.textContent = '✓';
                        iconElement.classList.add('correct-icon');
                    } else {
                        answerElement.classList.add('incorrect');
                        iconElement.textContent = '✗';
                        iconElement.classList.add('incorrect-icon');
                    }
                    
                    iconElement.classList.remove('hidden');
                });
                
                document.querySelector('.reveal-btn').style.display = 'none';
            }
        });
    </script>
</body>
</html>`;
}
