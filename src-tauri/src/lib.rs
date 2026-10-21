use serde::Serialize;
use tauri::{
    AppHandle, Emitter, LogicalPosition, LogicalSize, Manager, Webview, WebviewUrl,
    webview::{PageLoadEvent, WebviewBuilder},
};

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct BrowserPageState {
    label: String,
    url: Option<String>,
    loading: Option<bool>,
    title: Option<String>,
}

fn ensure_main_caller(caller: &Webview) -> Result<(), String> {
    if caller.label() == "main" {
        Ok(())
    } else {
        Err("Comando disponível apenas na janela principal.".into())
    }
}

fn ensure_tab_label(label: &str) -> Result<(), String> {
    let suffix = label.strip_prefix("browser-tab-").unwrap_or_default();
    if suffix.is_empty()
        || suffix.len() > 10
        || !suffix.chars().all(|character| character.is_ascii_digit())
    {
        return Err("Identificador de aba inválido.".into());
    }
    Ok(())
}

fn is_allowed_browser_url(url: &tauri::Url) -> bool {
    matches!(url.scheme(), "http" | "https")
        && url.host_str().is_some()
        && url.username().is_empty()
        && url.password().is_none()
}

fn parse_browser_url(value: &str) -> Result<tauri::Url, String> {
    let url = tauri::Url::parse(value).map_err(|_| "Endereço inválido.".to_string())?;
    if !matches!(url.scheme(), "http" | "https") || url.host_str().is_none() {
        return Err("O NoBrowser aceita apenas endereços HTTP ou HTTPS.".into());
    }
    if !url.username().is_empty() || url.password().is_some() {
        return Err("Endereços com credenciais não são aceitos.".into());
    }
    Ok(url)
}

fn get_browser_tab(app: &AppHandle, caller: &Webview, label: &str) -> Result<Webview, String> {
    ensure_main_caller(caller)?;
    ensure_tab_label(label)?;
    app.get_webview(label)
        .ok_or_else(|| "A aba não está mais aberta.".into())
}

fn emit_page_state(app: &AppHandle, state: BrowserPageState) {
    let _ = app.emit_to("main", "browser-tab-state", state);
}

#[tauri::command]
async fn create_browser_tab(
    caller: Webview,
    app: AppHandle,
    tab_label: String,
    url: String,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
) -> Result<(), String> {
    ensure_main_caller(&caller)?;
    ensure_tab_label(&tab_label)?;
    if app.get_webview(&tab_label).is_some() {
        return Err("Essa aba já possui uma página aberta.".into());
    }
    if !x.is_finite()
        || !y.is_finite()
        || !width.is_finite()
        || !height.is_finite()
        || width < 1.0
        || height < 1.0
    {
        return Err("Área de página inválida.".into());
    }
    let url = parse_browser_url(&url)?;
    let parent = app
        .get_webview("main")
        .ok_or_else(|| "A janela principal não está disponível.".to_string())?
        .window();

    let navigation_app = app.clone();
    let title_app = app.clone();
    let builder = WebviewBuilder::new(tab_label.clone(), WebviewUrl::External(url))
        .background_color(tauri::webview::Color(11, 17, 23, 255))
        .on_navigation(is_allowed_browser_url)
        .on_new_window(move |url, _| {
            if is_allowed_browser_url(&url) {
                let _ = navigation_app.emit_to("main", "browser-open-new-tab", url.to_string());
            }
            tauri::webview::NewWindowResponse::Deny
        })
        .on_page_load(move |webview, payload| {
            let event = payload.event();
            emit_page_state(
                &title_app,
                BrowserPageState {
                    label: webview.label().to_string(),
                    url: Some(payload.url().to_string()),
                    loading: Some(event == PageLoadEvent::Started),
                    title: None,
                },
            );
        })
        .on_document_title_changed(move |webview, title| {
            emit_page_state(
                &app,
                BrowserPageState {
                    label: webview.label().to_string(),
                    url: webview.url().ok().map(|url| url.to_string()),
                    loading: Some(false),
                    title: Some(title),
                },
            );
        });

    tauri::async_runtime::spawn_blocking(move || {
        let child = parent
            .add_child(
                builder,
                LogicalPosition::new(x.max(0.0), y.max(0.0)),
                LogicalSize::new(width, height),
            )
            .map_err(|error| error.to_string())?;
        child.hide().map_err(|error| error.to_string())
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
fn navigate_browser_tab(
    caller: Webview,
    app: AppHandle,
    tab_label: String,
    url: String,
) -> Result<(), String> {
    let tab = get_browser_tab(&app, &caller, &tab_label)?;
    tab.navigate(parse_browser_url(&url)?)
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn reload_browser_tab(caller: Webview, app: AppHandle, tab_label: String) -> Result<(), String> {
    get_browser_tab(&app, &caller, &tab_label)?
        .reload()
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn history_browser_tab(
    caller: Webview,
    app: AppHandle,
    tab_label: String,
    direction: String,
) -> Result<(), String> {
    let script = match direction.as_str() {
        "back" => "history.back()",
        "forward" => "history.forward()",
        _ => return Err("Direção de histórico inválida.".into()),
    };
    get_browser_tab(&app, &caller, &tab_label)?
        .eval(script)
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn set_browser_tab_bounds(
    caller: Webview,
    app: AppHandle,
    tab_label: String,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
) -> Result<(), String> {
    if !x.is_finite()
        || !y.is_finite()
        || !width.is_finite()
        || !height.is_finite()
        || width < 1.0
        || height < 1.0
    {
        return Err("Área de página inválida.".into());
    }
    let tab = get_browser_tab(&app, &caller, &tab_label)?;
    tab.set_position(LogicalPosition::new(x.max(0.0), y.max(0.0)))
        .and_then(|()| tab.set_size(LogicalSize::new(width, height)))
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn show_browser_tab(caller: Webview, app: AppHandle, tab_label: String) -> Result<(), String> {
    get_browser_tab(&app, &caller, &tab_label)?
        .show()
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn hide_browser_tab(caller: Webview, app: AppHandle, tab_label: String) -> Result<(), String> {
    get_browser_tab(&app, &caller, &tab_label)?
        .hide()
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn focus_browser_tab(caller: Webview, app: AppHandle, tab_label: String) -> Result<(), String> {
    get_browser_tab(&app, &caller, &tab_label)?
        .set_focus()
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn close_browser_tab(caller: Webview, app: AppHandle, tab_label: String) -> Result<(), String> {
    get_browser_tab(&app, &caller, &tab_label)?
        .close()
        .map_err(|error| error.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            create_browser_tab,
            navigate_browser_tab,
            reload_browser_tab,
            history_browser_tab,
            set_browser_tab_bounds,
            show_browser_tab,
            hide_browser_tab,
            focus_browser_tab,
            close_browser_tab,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
