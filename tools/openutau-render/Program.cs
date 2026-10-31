using System.Collections.Concurrent;
using System.Reflection;
using System.Runtime.CompilerServices;
using System.Runtime.Loader;
using OpenUtau.Core;
using OpenUtau.Core.Format;
using OpenUtau.Core.Ustx;
using OpenUtau.Core.Util;
using Serilog;

class Program {
 static string app="";
 static BlockingCollection<Action> queue=new();
 static int Main(string[] args) {
  if(args.Length<4)throw new ArgumentException("Expected app-directory, project.ustx, export.wav, singer-directory");
  app=Path.GetFullPath(args[0]);
  Environment.SetEnvironmentVariable("PATH",app+";"+Environment.GetEnvironmentVariable("PATH"));
  AssemblyLoadContext.Default.Resolving+=(context,name)=>{
   string path=Path.Combine(app,name.Name+".dll");return File.Exists(path)?context.LoadFromAssemblyPath(path):null;
  };
  try {Run(args);return 0;}catch(Exception e){Console.WriteLine(e);return 1;}
 }
 [MethodImpl(MethodImplOptions.NoInlining)]
 static void Run(string[] args) {
  System.Text.Encoding.RegisterProvider(System.Text.CodePagesEncodingProvider.Instance);
  Log.Logger=new LoggerConfiguration().MinimumLevel.Information().WriteTo.Console().CreateLogger();
  var paths=PathManager.Inst;
  foreach(var pair in new[]{("RootPath",app),("DataPath",app),("CachePath",app+"/Cache")})typeof(PathManager).GetProperty(pair.Item1)!.SetValue(paths,pair.Item2);
  Directory.CreateDirectory(paths.CachePath);
  Preferences.Default.PreRender=false;
  Preferences.Default.AdditionalSingerPath=Path.GetFullPath(args[3]);
  Preferences.Default.OnnxRunner="DirectML";
  Preferences.Default.OnnxGpu=0;
  Preferences.Default.NumRenderThreads=1;
  Preferences.Default.DiffSingerSteps=20;
  Preferences.Default.DiffSingerStepsVariance=20;
  var doc=DocManager.Inst;
  doc.PostOnUIThread=action=>queue.Add(action);
  doc.Initialize(Thread.CurrentThread,TaskScheduler.Default);
  SingerManager.Inst.Initialize();
  Console.WriteLine("SINGERS: "+string.Join(",",SingerManager.Inst.Singers.Keys));
  Console.WriteLine("OpenUtau core "+typeof(DocManager).Assembly.GetCustomAttribute<AssemblyInformationalVersionAttribute>()?.InformationalVersion);
  var began=DateTime.UtcNow;
  var project=Ustx.Load(args[1]);
  doc.ExecuteCmd(new LoadProjectNotification(project));
  var parts=project.parts.OfType<UVoicePart>().ToArray();
  var timeout=DateTime.UtcNow.AddMinutes(5);
  while(parts.Any(p=>!p.PhonemesUpToDate||p.renderPhrases.Count==0)) {
   if(DateTime.UtcNow>timeout)throw new Exception("Phonemizer timeout");
   if(queue.TryTake(out var action,100))action();
  }
  Console.WriteLine("PHRASES "+parts.Sum(p=>p.renderPhrases.Count)+" PHONEMES "+parts.Sum(p=>p.phonemes.Count));
  var alignment=parts.SelectMany(p=>p.notes.Select(n=>new {
   lyric=n.lyric,start=project.timeAxis.TickPosToMsPos(p.position+n.position)/1000,
   phones=p.phonemes.Where(ph=>ph.Parent==n).Select(ph=>new {phoneme=ph.phoneme,start=ph.PositionMs/1000,end=ph.EndMs/1000,error=ph.Error}).ToArray()
  })).ToArray();
  File.WriteAllText(args[2]+".alignment.json",System.Text.Json.JsonSerializer.Serialize(alignment));
  if(args.Length>4&&args[4]=="alignment-only"){Console.WriteLine("ALIGNMENT EXPORTED");return;}
  var export=PlaybackManager.Inst.RenderToFiles(project,args[2]);
  while(!export.IsCompleted){if(queue.TryTake(out var action,100))action();}
  export.GetAwaiter().GetResult();
  while(queue.TryTake(out var action))action();
  foreach(var track in project.tracks.Where(t=>!t.Muted)){
   var file=paths.GetExportPath(args[2],track);
   if(!File.Exists(file)||File.GetLastWriteTimeUtc(file)<began)throw new Exception("No fresh export: "+file);
   Console.WriteLine("EXPORTED "+file);
  }
  Console.WriteLine("EXPORT FINISHED");
 }
}
