package com.foodhub.tools.qareportviewer;

import java.awt.Desktop;
import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.io.InputStream;
import java.net.URI;
import java.net.URISyntaxException;
import java.net.HttpURLConnection;
import java.security.CodeSource;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.net.URL;
import java.time.LocalTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.atomic.AtomicBoolean;

import javafx.application.Application;
import javafx.application.Platform;
import javafx.geometry.Insets;
import javafx.geometry.Pos;
import javafx.scene.Scene;
import javafx.scene.control.Alert;
import javafx.scene.control.Button;
import javafx.scene.control.ButtonType;
import javafx.scene.control.ComboBox;
import javafx.scene.control.Label;
import javafx.scene.control.Tab;
import javafx.scene.control.TabPane;
import javafx.scene.control.TextArea;
import javafx.scene.image.Image;
import javafx.scene.image.ImageView;
import javafx.scene.layout.BorderPane;
import javafx.scene.layout.HBox;
import javafx.scene.layout.Priority;
import javafx.scene.layout.VBox;
import javafx.stage.Stage;

public class QaReportViewerApp extends Application {
  private static final String APP_URL = "http://127.0.0.1:4173";
  private static final String PAYMENT_URL = "http://127.0.0.1:4174";
  private static final String APP_SWAGGER_URL = APP_URL + "/api-docs";
  private static final String PAYMENT_SWAGGER_URL = PAYMENT_URL + "/api-docs";
  private static final DateTimeFormatter LOG_TIME = DateTimeFormatter.ofPattern("HH:mm:ss");
  private static final String RESOURCE_ROOT = "/com/foodhub/tools/qareportviewer/";

  private final TextArea reportingArea = new TextArea();
  private final TextArea servicesArea = new TextArea();
  private final Label statusLabel = new Label("Select an artifact to view.");
  private final ComboBox<TestCommand> testSelector = new ComboBox<>();
  private Path repositoryRoot;
  private Process foodHubServiceProcess;
  private Process swaggerServiceProcess;
  private final AtomicBoolean testRunning = new AtomicBoolean(false);

  @Override
  public void start(Stage stage) {
    repositoryRoot = findRepositoryRoot().orElse(Path.of("").toAbsolutePath());

    configureTextArea(reportingArea);
    configureTextArea(servicesArea);

    testSelector.getItems().addAll(testCommands());
    testSelector.getSelectionModel().selectFirst();
    testSelector.setMaxWidth(Double.MAX_VALUE);

    TabPane tabs = new TabPane(
        tab("Observability and Reporting", createObservabilityReportingTab()),
        tab("Services and Test runner", createServicesTestRunnerTab()));
    tabs.setTabClosingPolicy(TabPane.TabClosingPolicy.UNAVAILABLE);

    BorderPane root = new BorderPane();
    root.getStyleClass().add("app-shell");
    root.setTop(createHeader());
    root.setCenter(tabs);
    root.setBottom(statusLabel);
    BorderPane.setMargin(statusLabel, new Insets(0, 16, 12, 16));

    Scene scene = new Scene(root, 1080, 680);
    stylesheet().ifPresent(css -> scene.getStylesheets().add(css));
    stage.setTitle("FoodHub QA Report Viewer");
    loadImage("foodhub-icon.png").ifPresent(icon -> stage.getIcons().add(icon));
    stage.setScene(scene);
    stage.setMinWidth(880);
    stage.setMinHeight(540);
    stage.setOnCloseRequest(_event -> {
      stopProcess(foodHubServiceProcess);
      stopProcess(swaggerServiceProcess);
    });
    stage.show();
  }

  private HBox createHeader() {
    ImageView logo = new ImageView();
    loadImage("foodhub-logo.png").ifPresent(logo::setImage);
    logo.setFitWidth(220);
    logo.setFitHeight(78);
    logo.setPreserveRatio(true);
    logo.getStyleClass().add("brand-logo");

    Label title = new Label("QA Report Viewer");
    title.getStyleClass().add("header-title");
    Label repository = new Label("Repository: " + repositoryRoot);
    repository.getStyleClass().add("header-subtitle");
    VBox titleBlock = new VBox(4, title, repository);
    titleBlock.setAlignment(Pos.CENTER_LEFT);

    HBox header = new HBox(18, logo, titleBlock);
    header.getStyleClass().add("brand-header");
    header.setAlignment(Pos.CENTER_LEFT);
    header.setPadding(new Insets(12, 18, 12, 18));
    return header;
  }

  private BorderPane createObservabilityReportingTab() {
    VBox buttons = new VBox(10,
        browserButton("Open QA Test Report", "qa-artifacts/test-report.html", reportingArea),
        textButton("View AI Failure Prompt", "qa-artifacts/ai-failure-analysis-prompt.txt", reportingArea),
        textButton("View AI Test Generation Prompt", "qa-artifacts/ai-test-generation-prompt.txt", reportingArea),
        textButton("View Failure Analysis Report", "qa-artifacts/failure-analysis-report.md", reportingArea),
        browserButton("Open Playwright Report", "playwright-report/index.html", reportingArea),
        textButton("View AI Test Suggestions", "qa-artifacts/ai-test-suggestions.md", reportingArea),
        browserButton("Open Coverage Report", "qa-artifacts/coverage/index.html", reportingArea),
        sectionLabel("Observability"),
        actionButton("Refresh Observability Dashboard", () -> runUtilityCommand("Observability refresh", npm("run", "observability:refresh"), reportingArea)),
        browserButton("Open Observability Dashboard", "qa-artifacts/FoodHub-Observability-Dashboard.xlsx", reportingArea),
        actionButton("Truncate Observability DB", this::confirmAndTruncateObservabilityDb));

    return createTabContent(buttons, reportingArea);
  }

  private BorderPane createServicesTestRunnerTab() {
    VBox buttons = new VBox(10,
        sectionLabel("Services"),
        actionButton("Start Service", this::startFoodHubService),
        actionButton("Stop Service", () -> stopManagedProcess("FoodHub service", true)),
        actionButton("Start Swagger Service", this::startSwaggerService),
        actionButton("Stop Swagger Service", () -> stopManagedProcess("Swagger service", false)),
        actionButton("Show Launch URLs", this::showLaunchUrls),
        sectionLabel("Test Runner"),
        testSelector,
        actionButton("Run Selected Test", this::runSelectedTest));

    return createTabContent(buttons, servicesArea);
  }

  private BorderPane createTabContent(VBox buttons, TextArea outputArea) {
    buttons.setPadding(new Insets(16));
    buttons.setPrefWidth(320);
    buttons.getChildren().forEach(node -> {
      if (node instanceof Button button) {
        button.setMaxWidth(Double.MAX_VALUE);
      }
    });

    BorderPane content = new BorderPane();
    content.setLeft(buttons);
    content.setCenter(outputArea);
    BorderPane.setMargin(outputArea, new Insets(16, 16, 16, 0));
    return content;
  }

  private Tab tab(String title, BorderPane content) {
    Tab tab = new Tab(title);
    tab.setContent(content);
    return tab;
  }

  private void configureTextArea(TextArea textArea) {
    textArea.setEditable(false);
    textArea.setWrapText(true);
    textArea.setStyle("-fx-font-family: 'Consolas'; -fx-font-size: 13px;");
    VBox.setVgrow(textArea, Priority.ALWAYS);
  }

  private Button browserButton(String label, String relativePath, TextArea outputArea) {
    Button button = new Button(label);
    button.setOnAction(_event -> openInBrowser(relativePath, outputArea));
    return button;
  }

  private Button textButton(String label, String relativePath, TextArea outputArea) {
    Button button = new Button(label);
    button.setOnAction(_event -> loadTextArtifact(relativePath, outputArea));
    return button;
  }

  private Button actionButton(String label, Runnable action) {
    Button button = new Button(label);
    button.setOnAction(_event -> action.run());
    return button;
  }

  private Label sectionLabel(String text) {
    Label label = new Label(text);
    label.getStyleClass().add("section-label");
    return label;
  }

  private void startFoodHubService() {
    if (isAlive(foodHubServiceProcess)) {
      appendLine(servicesArea, "FoodHub service is already running.");
      showLaunchUrls();
      return;
    }

    foodHubServiceProcess = startLongRunningProcess("FoodHub service", List.of("npm", "run", "dev"), servicesArea);
    showLaunchUrls();
  }

  private void startSwaggerService() {
    if (isAlive(swaggerServiceProcess)) {
      appendLine(servicesArea, "Swagger service is already running.");
      showSwaggerUrls();
      return;
    }

    if (isAlive(foodHubServiceProcess)) {
      appendLine(servicesArea, "Swagger is available from the running FoodHub service.");
      showSwaggerUrls();
      return;
    }

    swaggerServiceProcess = startLongRunningProcess("Swagger service", List.of("npm", "run", "dev"), servicesArea);
    showSwaggerUrls();
  }

  private Process startLongRunningProcess(String label, List<String> command, TextArea outputArea) {
    try {
      Process process = newProcess(command).start();
      outputArea.clear();
      appendLine(outputArea, label + " started with: " + String.join(" ", command));
      readProcessOutput(label, process, outputArea);
      statusLabel.setText(label + " started.");
      return process;
    } catch (IOException error) {
      showError("Unable to start " + label, error.getMessage());
      return null;
    }
  }

  private void stopManagedProcess(String label, boolean foodHubService) {
    Process process = foodHubService ? foodHubServiceProcess : swaggerServiceProcess;
    if (!isAlive(process)) {
      appendLine(servicesArea, label + " is not running from this viewer.");
      statusLabel.setText(label + " is not running.");
      return;
    }

    stopProcess(process);
    if (foodHubService) {
      foodHubServiceProcess = null;
    } else {
      swaggerServiceProcess = null;
    }
    appendLine(servicesArea, label + " stopped.");
    statusLabel.setText(label + " stopped.");
  }

  private void stopProcess(Process process) {
    if (process == null) {
      return;
    }

    ProcessHandle processHandle = process.toHandle();
    processHandle.descendants().forEach(child -> {
      if (child.isAlive()) {
        child.destroy();
      }
    });
    process.destroy();
    processHandle.descendants().forEach(child -> {
      if (child.isAlive()) {
        child.destroyForcibly();
      }
    });
    if (process.isAlive()) {
      process.destroyForcibly();
    }
  }

  private boolean isAlive(Process process) {
    return process != null && process.isAlive();
  }

  private void showLaunchUrls() {
    servicesArea.setText(String.join(System.lineSeparator(),
        "FoodHub service URLs",
        "App: " + APP_URL,
        "Swagger: " + APP_SWAGGER_URL,
        "Payment gateway: " + PAYMENT_URL,
        "Payment Swagger: " + PAYMENT_SWAGGER_URL,
        "",
        "Use the Start Service button to launch the app and payment gateway together."));
    servicesArea.positionCaret(0);
    statusLabel.setText("Launch URLs shown.");
  }

  private void showSwaggerUrls() {
    servicesArea.setText(String.join(System.lineSeparator(),
        "Swagger launch URLs",
        "FoodHub app Swagger: " + APP_SWAGGER_URL,
        "Payment gateway Swagger: " + PAYMENT_SWAGGER_URL,
        "",
        "Swagger is served by the FoodHub Express services."));
    servicesArea.positionCaret(0);
    statusLabel.setText("Swagger URLs shown.");
  }

  private void runSelectedTest() {
    TestCommand selected = testSelector.getValue();
    if (selected == null) {
      statusLabel.setText("Select a test command first.");
      return;
    }

    if (!testRunning.compareAndSet(false, true)) {
      appendLine(servicesArea, "A test command is already running.");
      return;
    }

    servicesArea.clear();
    appendLine(servicesArea, "Running: " + selected.label());
    selected.commands().forEach(command -> appendLine(servicesArea, "Queued: " + String.join(" ", command)));
    statusLabel.setText("Running test command: " + selected.label());

    Thread runner = new Thread(() -> {
      int finalExitCode = 0;
      try {
        Process testServiceProcess = null;
        if (selected.requiresFoodHubService() && !isAlive(foodHubServiceProcess) && !isAlive(swaggerServiceProcess)) {
          appendLine(servicesArea, "Starting FoodHub service for " + selected.label() + ".");
          testServiceProcess = newProcess(List.of("npm", "run", "dev")).start();
          readProcessOutput("FoodHub test service", testServiceProcess, servicesArea);
          waitForService(APP_URL + "/health");
          appendLine(servicesArea, "FoodHub service is ready for " + selected.label() + ".");
        }

        try {
          for (List<String> command : selected.commands()) {
            appendLine(servicesArea, "Executing: " + String.join(" ", command));
            Process process = newProcess(command).start();
            readProcessOutput(selected.label(), process, servicesArea);
            int exitCode = process.waitFor();
            appendLine(servicesArea, "Finished with exit code " + exitCode + ": " + String.join(" ", command));
            if (exitCode != 0) {
              finalExitCode = exitCode;
            }
          }
        } finally {
          if (testServiceProcess != null) {
            stopProcess(testServiceProcess);
            appendLine(servicesArea, "Stopped FoodHub service started for " + selected.label() + ".");
          }
        }
      } catch (IOException error) {
        appendLine(servicesArea, "Unable to run test command: " + error.getMessage());
        finalExitCode = -1;
      } catch (InterruptedException error) {
        Thread.currentThread().interrupt();
        appendLine(servicesArea, "Test command interrupted.");
        finalExitCode = -1;
      } finally {
        int statusExitCode = finalExitCode;
        testRunning.set(false);
        Platform.runLater(() -> statusLabel.setText(
            statusExitCode == 0 ? "Test command passed: " + selected.label()
                : "Test command finished with exit code " + statusExitCode + ": " + selected.label()));
      }
    }, "foodhub-test-runner");
    runner.setDaemon(true);
    runner.start();
  }

  private void runUtilityCommand(String label, List<String> command, TextArea outputArea) {
    if (!testRunning.compareAndSet(false, true)) {
      appendLine(outputArea, "Another command is already running.");
      return;
    }

    outputArea.clear();
    appendLine(outputArea, "Executing: " + String.join(" ", command));
    statusLabel.setText("Running: " + label);

    Thread runner = new Thread(() -> {
      int exitCode = -1;
      try {
        Process process = newProcess(command).start();
        readProcessOutput(label, process, outputArea);
        exitCode = process.waitFor();
        appendLine(outputArea, "Finished with exit code " + exitCode + ": " + String.join(" ", command));
      } catch (IOException error) {
        appendLine(outputArea, "Unable to run command: " + error.getMessage());
      } catch (InterruptedException error) {
        Thread.currentThread().interrupt();
        appendLine(outputArea, "Command interrupted.");
      } finally {
        int finalExitCode = exitCode;
        testRunning.set(false);
        Platform.runLater(() -> statusLabel.setText(
            finalExitCode == 0 ? label + " completed." : label + " finished with exit code " + finalExitCode + "."));
      }
    }, label.toLowerCase().replaceAll("[^a-z0-9]+", "-"));
    runner.setDaemon(true);
    runner.start();
  }

  private void confirmAndTruncateObservabilityDb() {
    Alert alert = new Alert(Alert.AlertType.CONFIRMATION);
    alert.setTitle("Truncate Observability DB");
    alert.setHeaderText("Clear all local observability history?");
    alert.setContentText("This deletes rows from the portable SQLite observability tables. It keeps the DB file and schema.");

    Optional<ButtonType> result = alert.showAndWait();
    if (result.isPresent() && result.get() == ButtonType.OK) {
      runUtilityCommand("Observability truncate", npm("run", "observability:truncate"), reportingArea);
    }
  }

  private ProcessBuilder newProcess(List<String> command) {
    List<String> wrappedCommand = new ArrayList<>();
    if (System.getProperty("os.name").toLowerCase().contains("win")) {
      wrappedCommand.add("cmd");
      wrappedCommand.add("/c");
      wrappedCommand.addAll(commandWithWindowsNpm(command));
    } else {
      wrappedCommand.addAll(command);
    }

    ProcessBuilder processBuilder = new ProcessBuilder(wrappedCommand);
    processBuilder.directory(repositoryRoot.toFile());
    processBuilder.redirectErrorStream(true);
    return processBuilder;
  }

  private List<String> commandWithWindowsNpm(List<String> command) {
    if (command.isEmpty() || !"npm".equals(command.get(0))) {
      return command;
    }

    List<String> windowsCommand = new ArrayList<>(command);
    windowsCommand.set(0, "npm.cmd");
    return windowsCommand;
  }

  private void readProcessOutput(String label, Process process, TextArea outputArea) {
    Thread reader = new Thread(() -> {
      try (BufferedReader output = new BufferedReader(new InputStreamReader(process.getInputStream(), StandardCharsets.UTF_8))) {
        String line;
        while ((line = output.readLine()) != null) {
          appendLine(outputArea, "[" + label + "] " + line);
        }
      } catch (IOException error) {
        appendLine(outputArea, "[" + label + "] output reader stopped: " + error.getMessage());
      }
    }, label.toLowerCase().replaceAll("[^a-z0-9]+", "-") + "-output");
    reader.setDaemon(true);
    reader.start();
  }

  private void appendLine(TextArea outputArea, String message) {
    Platform.runLater(() -> outputArea.appendText("[" + LocalTime.now().format(LOG_TIME) + "] " + message + System.lineSeparator()));
  }

  private void waitForService(String healthUrl) throws IOException, InterruptedException {
    IOException lastError = null;
    for (int attempt = 0; attempt < 30; attempt++) {
      try {
        HttpURLConnection connection = (HttpURLConnection) new URL(healthUrl).openConnection();
        connection.setConnectTimeout(1_000);
        connection.setReadTimeout(1_000);
        if (connection.getResponseCode() == 200) {
          return;
        }
      } catch (IOException error) {
        lastError = error;
      }
      Thread.sleep(1_000);
    }

    throw new IOException("FoodHub service did not become ready at " + healthUrl, lastError);
  }

  private List<TestCommand> testCommands() {
    return List.of(
        new TestCommand("All Tests", List.of(
            npm("run", "test:unit"),
            npm("run", "test:integration"),
            npm("run", "test:contract"),
            npm("run", "test:e2e"),
            npm("run", "test:load"),
            npm("run", "test:report"),
            npm("run", "observability:refresh")),
            true),
        new TestCommand("Unit Tests", List.of(
            npm("run", "test:unit"),
            npm("run", "test:report", "--", "--type=Unit"),
            npm("run", "observability:refresh"))),
        new TestCommand("Integration Tests", List.of(
            npm("run", "test:integration"),
            npm("run", "test:report", "--", "--type=Integration"),
            npm("run", "observability:refresh"))),
        new TestCommand("Contract Tests", List.of(
            npm("run", "test:contract"),
            npm("run", "test:report", "--", "--type=Contract"),
            npm("run", "observability:refresh"))),
        new TestCommand("E2E Tests", List.of(
            npm("run", "test:e2e"),
            npm("run", "test:report", "--", "--type=E2E"),
            npm("run", "observability:refresh"))),
        new TestCommand("Load Tests", List.of(
            npm("run", "test:load"),
            npm("run", "test:report", "--", "--type=Load"),
            npm("run", "observability:refresh")),
            true),
        new TestCommand("AI Coverage Workbook", List.of(
            npm("run", "ai:coverage"))));
  }

  private List<String> npm(String... args) {
    List<String> command = new ArrayList<>();
    command.add("npm");
    command.addAll(List.of(args));
    return command;
  }

  private void openInBrowser(String relativePath, TextArea outputArea) {
    Path artifact = repositoryRoot.resolve(relativePath).normalize();
    if (!Files.exists(artifact)) {
      showMissingArtifact(artifact, outputArea);
      return;
    }

    try {
      Desktop.getDesktop().browse(artifact.toUri());
      statusLabel.setText("Opened in browser: " + artifact);
    } catch (IOException | UnsupportedOperationException error) {
      showError("Unable to open browser", error.getMessage());
    }
  }

  private void loadTextArtifact(String relativePath, TextArea outputArea) {
    Path artifact = repositoryRoot.resolve(relativePath).normalize();
    if (!Files.exists(artifact)) {
      showMissingArtifact(artifact, outputArea);
      return;
    }

    try {
      outputArea.setText(Files.readString(artifact, StandardCharsets.UTF_8));
      outputArea.positionCaret(0);
      statusLabel.setText("Loaded: " + artifact);
    } catch (IOException error) {
      showError("Unable to read artifact", error.getMessage());
    }
  }

  private Optional<Path> findRepositoryRoot() {
    List<Path> candidates = new ArrayList<>();
    candidates.add(Path.of("").toAbsolutePath());
    candidates.add(Path.of(System.getProperty("user.dir")).toAbsolutePath());
    executableLocation().ifPresent(candidates::add);

    for (Path candidate : candidates) {
      Optional<Path> root = searchUpward(candidate);
      if (root.isPresent()) {
        return root;
      }
    }

    return Optional.empty();
  }

  private Optional<Path> executableLocation() {
    CodeSource codeSource = QaReportViewerApp.class.getProtectionDomain().getCodeSource();
    if (codeSource == null || codeSource.getLocation() == null) {
      return Optional.empty();
    }

    try {
      Path location = Path.of(codeSource.getLocation().toURI()).toAbsolutePath();
      return Optional.of(Files.isRegularFile(location) ? location.getParent() : location);
    } catch (IllegalArgumentException | URISyntaxException error) {
      return Optional.empty();
    }
  }

  private Optional<Path> searchUpward(Path start) {
    Path current = start.normalize();
    while (current != null) {
      if (Files.exists(current.resolve("qa-artifacts"))) {
        return Optional.of(current);
      }
      current = current.getParent();
    }
    return Optional.empty();
  }

  private Optional<Image> loadImage(String resourceName) {
    InputStream stream = QaReportViewerApp.class.getResourceAsStream(RESOURCE_ROOT + resourceName);
    if (stream == null) {
      return Optional.empty();
    }

    return Optional.of(new Image(stream));
  }

  private Optional<String> stylesheet() {
    URL stylesheetUrl = QaReportViewerApp.class.getResource(RESOURCE_ROOT + "foodhub-viewer.css");
    return stylesheetUrl == null ? Optional.empty() : Optional.of(stylesheetUrl.toExternalForm());
  }

  private void showMissingArtifact(Path artifact, TextArea outputArea) {
    outputArea.setText("Artifact not found:\n" + artifact);
    statusLabel.setText("Missing artifact: " + artifact);
  }

  private void showError(String title, String message) {
    Alert alert = new Alert(Alert.AlertType.ERROR);
    alert.setTitle(title);
    alert.setHeaderText(title);
    alert.setContentText(message == null || message.isBlank() ? "No additional details were provided." : message);
    alert.showAndWait();
  }

  private record TestCommand(String label, List<List<String>> commands, boolean requiresFoodHubService) {
    TestCommand(String label, List<List<String>> commands) {
      this(label, commands, false);
    }

    @Override
    public String toString() {
      return label;
    }
  }

  public static void main(String[] args) {
    launch(args);
  }
}
